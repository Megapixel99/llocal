/**
 * Non-secret settings sync (Phase 5).
 *
 * Mirrors a small whitelist of preference values through the companion server's
 * /settings blob so both devices "feel identical". Server-authoritative, same as
 * chat sync: on load a device adopts the server's settings; local edits are pushed
 * back. SECRETS ARE NEVER INCLUDED — the server token and GitHub PAT live in
 * `llocal.remoteConfig` and are deliberately left out of the whitelist below.
 *
 * We move the raw localStorage strings verbatim (both devices run the same code,
 * so each key's on-disk format round-trips), and apply pulled values straight to
 * the jotai atoms (via the default store) so the UI updates without a reload.
 */
import { getDefaultStore } from 'jotai'
import {
  effortAtom,
  verbosityAtom,
  mascotEnabledAtom,
  prefModelAtom,
  transparencyModeAtom,
  backgroundImageAtom,
  customInstructionsAtom,
  responseStyleAtom,
  promptLibraryAtom,
  memoriesAtom,
  type SavedPrompt,
  type MemoryItem,
  type Effort,
  type Verbosity
} from '../store/mocks'
import type { ResponseStyleId } from '../../../shared/styles'
import { getServerConfig, isServerConfigured } from './config'
import { fetchWithTimeout } from './serverClient'

const store = getDefaultStore()

/**
 * The synced settings. `key` is the localStorage key; `apply` writes a pulled raw
 * string into the running app (atom + persistence). Device-specific things
 * (workingFolder, activeTab, the model list) and all secrets are intentionally absent.
 */
interface SettingEntry {
  key: string
  apply: (raw: string) => void
}

const SETTINGS: SettingEntry[] = [
  // atomWithStorage-backed: store.set both updates the atom AND persists to localStorage.
  { key: 'researchEffort', apply: (r) => store.set(effortAtom, JSON.parse(r) as Effort) },
  { key: 'reasoningVerbosity', apply: (r) => store.set(verbosityAtom, JSON.parse(r) as Verbosity) },
  { key: 'mascotEnabled', apply: (r) => store.set(mascotEnabledAtom, JSON.parse(r) as boolean) },
  // plain atoms: set the atom for live UI + write localStorage so it survives a reload.
  { key: 'prefModel', apply: (r) => { store.set(prefModelAtom, r); localStorage.setItem('prefModel', r) } },
  {
    key: 'transparencyMode',
    apply: (r) => { store.set(transparencyModeAtom, r === 'true'); localStorage.setItem('transparencyMode', r) }
  },
  { key: 'bg', apply: (r) => { store.set(backgroundImageAtom, r); localStorage.setItem('bg', r) } },
  { key: 'customInstructions', apply: (r) => store.set(customInstructionsAtom, JSON.parse(r) as string) },
  { key: 'responseStyle', apply: (r) => store.set(responseStyleAtom, JSON.parse(r) as ResponseStyleId) },
  { key: 'promptLibrary', apply: (r) => store.set(promptLibraryAtom, JSON.parse(r) as SavedPrompt[]) },
  { key: 'memories', apply: (r) => store.set(memoriesAtom, JSON.parse(r) as MemoryItem[]) }
]

const SETTINGS_KEYS = SETTINGS.map((s) => s.key)

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

/** The current local values of the whitelisted settings (raw localStorage strings). */
function readLocalBlob(): Record<string, string> {
  const blob: Record<string, string> = {}
  for (const key of SETTINGS_KEYS) {
    const v = localStorage.getItem(key)
    if (v !== null) blob[key] = v
  }
  return blob
}

// The blob we last reconciled with the server, so we can tell a genuine local edit
// (push it) apart from "already in sync" (do nothing). Module-scoped: one client.
let lastSyncedJson = ''
let initialized = false

/**
 * One reconcile pass: flush a pending local edit, then pull + apply the server's
 * settings. Serialized against itself. Never throws — offline retries next tick.
 */
let syncing = false
export async function syncSettings(): Promise<void> {
  if (!isServerConfigured() || syncing) return
  syncing = true
  try {
    const localJson = JSON.stringify(readLocalBlob())

    // 1) Flush a real local edit BEFORE pulling, so the pull can't clobber a change
    //    the user just made on this device.
    if (initialized && localJson !== lastSyncedJson) {
      try {
        await api('/settings', { method: 'PUT', body: localJson })
        lastSyncedJson = localJson
      } catch {
        return // offline — keep the edit and retry next tick
      }
    }

    // 2) Pull the server blob.
    let remote: Record<string, string>
    try {
      remote = await api<Record<string, string>>('/settings')
    } catch {
      return // offline
    }

    // 3) First run against an EMPTY server: seed it from this device so settings
    //    propagate to the next device instead of staying blank forever.
    if (!initialized && Object.keys(remote).length === 0) {
      try {
        await api('/settings', { method: 'PUT', body: localJson })
      } catch {
        /* offline — try again next tick */
      }
      lastSyncedJson = localJson
      initialized = true
      return
    }

    // 4) Apply any server values that differ locally.
    for (const entry of SETTINGS) {
      const rv = remote[entry.key]
      if (rv === undefined || localStorage.getItem(entry.key) === rv) continue
      try {
        entry.apply(rv)
      } catch {
        /* skip a malformed value */
      }
    }
    lastSyncedJson = JSON.stringify(readLocalBlob())
    initialized = true
  } finally {
    syncing = false
  }
}
