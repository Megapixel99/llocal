/**
 * Chat sync engine (client side).
 *
 * The companion server is the source of truth (server-authoritative). This module
 * keeps the local Localbase/IndexedDB cache in agreement with it so both the
 * desktop and phone show the same history:
 *   - writes: useDb saves locally (instant UI), then calls pushLocalChat() to
 *     mirror the doc to the server. A failed push marks the doc `dirty` for retry.
 *   - reads: components keep reading the local cache (unchanged) — syncChats()
 *     pulls the server's changes into the cache in the background.
 *
 * When no companion server is configured (e.g. a stock desktop install), every
 * function is a no-op and useDb behaves exactly as it did before — purely local.
 *
 * Chats are keyed by their existing ISO-timestamp `date`, matching the server PK,
 * so no id remapping is needed. `:date` contains ':' so it is percent-encoded.
 */
import { getDefaultStore } from 'jotai'
import { db } from '@renderer/utils/db'
import { getServerConfig, isServerConfigured } from './config'
import { fetchWithTimeout } from './serverClient'
import { syncStatusAtom, type SyncState, type Message } from '../store/mocks'
import type { MessageMetric } from '../../../shared/analytics'

const store = getDefaultStore()

/** Report sync connectivity to the sidebar indicator. */
function reportStatus(state: SyncState): void {
  store.set(syncStatusAtom, (prev) => ({
    state,
    lastSyncedAt: state === 'ok' ? Date.now() : prev.lastSyncedAt
  }))
}

/** A chat document as stored in the local Localbase cache. */
export interface LocalChatDoc {
  date: string
  title: string
  chat: Message[]
  unread?: boolean
  metrics?: MessageMetric[]
  /** Server-clock timestamp of the version we last saw; drives delta pulls. */
  updatedAt?: number
  /** Local edits not yet confirmed pushed to the server (retry on next sync). */
  dirty?: boolean
}

export interface RemoteChatSummary {
  date: string
  title: string
  unread: boolean
  updatedAt: number
  deleted: boolean
}
export interface RemoteChatRecord extends RemoteChatSummary {
  chat: Message[]
  metrics: MessageMetric[]
}

/** localStorage cursor: the max server `updatedAt` we've pulled (per device). */
const CURSOR_KEY = 'llocal.syncCursor'

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = getServerConfig()
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error((data as { error?: string }).error || `Server error ${res.status}`)
  return data as T
}

/** Low-level typed calls to the server's /chats routes. */
export const chatApi = {
  list: (since?: number): Promise<RemoteChatSummary[]> =>
    api(`/chats${since !== undefined ? `?since=${since}` : ''}`),
  get: (date: string): Promise<RemoteChatRecord> => api(`/chats/${encodeURIComponent(date)}`),
  put: (doc: LocalChatDoc): Promise<RemoteChatRecord> =>
    api(`/chats/${encodeURIComponent(doc.date)}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: doc.title ?? '',
        unread: !!doc.unread,
        chat: doc.chat ?? [],
        metrics: doc.metrics ?? []
      })
    }),
  del: (date: string): Promise<{ ok: boolean }> =>
    api(`/chats/${encodeURIComponent(date)}`, { method: 'DELETE' })
}

function chatDoc(date: string): { get: () => Promise<LocalChatDoc | undefined>; update: (p: Partial<LocalChatDoc>) => Promise<unknown>; delete: () => Promise<unknown> } {
  return db.collection('chat').doc({ date })
}

/**
 * Mirror a local chat to the server. On success stamps the doc with the server's
 * `updatedAt` and clears `dirty`; on failure (offline) leaves it `dirty` for the
 * next syncChats() to retry. Never throws — writes must not fail the UI.
 */
export async function pushLocalChat(date: string): Promise<void> {
  if (!isServerConfigured()) return
  const doc = (await chatDoc(date).get()) as LocalChatDoc | undefined
  if (!doc) return
  try {
    const saved = await chatApi.put(doc)
    await chatDoc(date).update({ updatedAt: saved.updatedAt, dirty: false })
  } catch {
    await chatDoc(date).update({ dirty: true })
  }
}

/** Soft-delete on the server (throws so the caller can keep the local copy if it fails). */
export async function deleteRemoteChat(date: string): Promise<void> {
  if (!isServerConfigured()) return
  await chatApi.del(date)
}

// Serialize syncs: React StrictMode (dev) double-invokes effects and the poll /
// focus triggers can overlap. Two concurrent runs would each see "local missing"
// and both .add() the same date — a duplicate row. One run at a time avoids that.
let syncing = false

/**
 * Pull the server's changes into the local cache and retry any dirty pushes.
 * Calls `onChange` if the local cache was mutated so the UI can refresh.
 * Never throws — offline just means "try again next tick". Concurrent calls while
 * one is in flight are skipped (the interval/focus will catch up).
 */
export async function syncChats(onChange?: () => void): Promise<void> {
  if (!isServerConfigured() || syncing) return
  syncing = true
  reportStatus('syncing')
  try {
    // Snapshot the local cache once — used for existence/version checks below.
    // (Reading per-row would also make Localbase log "not found" for every miss.)
    let localAll: LocalChatDoc[] = []
    try {
      localAll = (await db.collection('chat').orderBy('date').get()) as LocalChatDoc[]
    } catch {
      /* empty cache */
    }
    const localMap = new Map(localAll.map((d) => [d.date, d]))

    // 1) Retry offline writes first, so our local edits reach the server before we
    //    decide whether the server's version is newer.
    for (const d of localAll) if (d.dirty) await pushLocalChat(d.date)

    // 2) Pull the delta since our cursor (includes tombstones).
    const cursor = Number(localStorage.getItem(CURSOR_KEY) ?? 0) || 0
    let changes: RemoteChatSummary[]
    try {
      changes = await chatApi.list(cursor)
    } catch {
      reportStatus('offline')
      return
    }

    let maxSeen = cursor
    let mutated = false
    for (const row of changes) {
      if (row.updatedAt > maxSeen) maxSeen = row.updatedAt
      const local = localMap.get(row.date)

      if (row.deleted) {
        if (local) {
          await chatDoc(row.date).delete()
          mutated = true
        }
        continue
      }
      // A local doc with unpushed edits wins; it was (re)pushed in step 1.
      if (local?.dirty) continue
      // Already have this exact version.
      if (local && local.updatedAt === row.updatedAt) continue

      try {
        const full = await chatApi.get(row.date)
        const next: LocalChatDoc = {
          date: full.date,
          title: full.title,
          chat: full.chat,
          unread: full.unread,
          metrics: full.metrics,
          updatedAt: full.updatedAt,
          dirty: false
        }
        if (local) await chatDoc(row.date).update(next)
        else await db.collection('chat').add(next)
        mutated = true
      } catch {
        /* skip this row; a later poll will retry */
      }
    }

    if (maxSeen > cursor) localStorage.setItem(CURSOR_KEY, String(maxSeen))
    if (mutated) onChange?.()
    reportStatus('ok')
  } finally {
    syncing = false
  }
}

/** Reset the pull cursor (e.g. after changing servers) so the next sync is a full pull. */
export function resetSyncCursor(): void {
  localStorage.removeItem(CURSOR_KEY)
}
