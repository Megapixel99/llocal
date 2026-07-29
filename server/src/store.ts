/**
 * SQLite-backed store for cross-device chat + settings sync.
 *
 * The companion server is the single source of truth ("server-authoritative"):
 * every client (desktop + phone) reads/writes chats here over HTTP (see sync.ts),
 * so switching devices shows the same history. This is the first persistent,
 * queryable store in the server — everything else is flat files / Faiss under the
 * data dir (see config.ts), and this DB lives right beside them at config.dbPath.
 *
 * Chats keep their existing renderer identity: the `date` ISO-timestamp string is
 * the primary key (it already keys IndexedDB on every client), so no migration or
 * ID remapping is needed. Deletes are SOFT (a `deleted_at` tombstone) so other
 * devices learn about removals on their next delta poll instead of the row simply
 * vanishing.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { config } from './config.ts'

// The data dir is created on boot in index.ts, but make sure the parent exists
// even if the store is imported first (e.g. by a test).
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

const db = new Database(config.dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    date         TEXT PRIMARY KEY,
    title        TEXT NOT NULL DEFAULT '',
    unread       INTEGER NOT NULL DEFAULT 0,
    chat_json    TEXT NOT NULL DEFAULT '[]',
    metrics_json TEXT NOT NULL DEFAULT '[]',
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER,
    project_id   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats (updated_at);

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// Migration: add project_id to DBs created before Projects existed. ALTER throws if
// the column is already present (fresh DBs above), so it's guarded.
try {
  db.exec('ALTER TABLE chats ADD COLUMN project_id TEXT')
} catch {
  /* column already exists */
}

/** A single non-secret settings blob is stored under this key. */
const SETTINGS_KEY = 'app'

export interface ChatSummary {
  date: string
  title: string
  unread: boolean
  updatedAt: number
  /** Project this chat belongs to, or null for none. */
  projectId: string | null
  /** True when this row is a tombstone (only surfaced in `?since=` delta results). */
  deleted: boolean
}

export interface ChatRecord extends ChatSummary {
  chat: unknown[]
  metrics: unknown[]
}

interface ChatDbRow {
  date: string
  title: string
  unread: number
  chat_json: string
  metrics_json: string
  updated_at: number
  deleted_at: number | null
  project_id: string | null
}

function parseArray(json: string): unknown[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function toSummary(row: ChatDbRow): ChatSummary {
  return {
    date: row.date,
    title: row.title,
    unread: !!row.unread,
    updatedAt: row.updated_at,
    projectId: row.project_id ?? null,
    deleted: row.deleted_at != null
  }
}

function toRecord(row: ChatDbRow): ChatRecord {
  return {
    ...toSummary(row),
    chat: parseArray(row.chat_json),
    metrics: parseArray(row.metrics_json)
  }
}

const stmtListAll = db.prepare(
  `SELECT date, title, unread, updated_at, deleted_at, project_id FROM chats
   WHERE deleted_at IS NULL ORDER BY date DESC`
)
const stmtListSince = db.prepare(
  `SELECT date, title, unread, updated_at, deleted_at, project_id FROM chats
   WHERE updated_at > ? ORDER BY updated_at ASC`
)
const stmtGet = db.prepare(`SELECT * FROM chats WHERE date = ?`)
const stmtUpsert = db.prepare(
  `INSERT INTO chats (date, title, unread, chat_json, metrics_json, updated_at, deleted_at, project_id)
   VALUES (@date, @title, @unread, @chat_json, @metrics_json, @updated_at, NULL, @project_id)
   ON CONFLICT(date) DO UPDATE SET
     title = excluded.title,
     unread = excluded.unread,
     chat_json = excluded.chat_json,
     metrics_json = excluded.metrics_json,
     updated_at = excluded.updated_at,
     deleted_at = NULL,
     project_id = excluded.project_id`
)
const stmtSoftDelete = db.prepare(
  `UPDATE chats SET deleted_at = @now, updated_at = @now WHERE date = @date`
)

/**
 * List chats.
 * - No `since`: every live (non-deleted) chat, newest first — a full list load.
 * - With `since`: every row (incl. tombstones) changed after that timestamp, oldest
 *   first — a delta poll. Callers apply `deleted` rows as removals.
 */
export function listChats(since?: number): ChatSummary[] {
  const rows = (since === undefined
    ? stmtListAll.all()
    : stmtListSince.all(since)) as ChatDbRow[]
  return rows.map(toSummary)
}

/** Full chat record, or null if unknown. Tombstoned rows are returned (with `deleted:true`). */
export function getChat(date: string): ChatRecord | null {
  const row = stmtGet.get(date) as ChatDbRow | undefined
  return row ? toRecord(row) : null
}

export interface PutChatInput {
  date: string
  title?: string
  unread?: boolean
  chat?: unknown[]
  metrics?: unknown[]
  projectId?: string | null
}

/** Upsert a chat (also un-deletes a previously tombstoned row). Returns the stored record. */
export function putChat(input: PutChatInput): ChatRecord {
  const now = Date.now()
  stmtUpsert.run({
    date: input.date,
    title: input.title ?? '',
    unread: input.unread ? 1 : 0,
    chat_json: JSON.stringify(Array.isArray(input.chat) ? input.chat : []),
    metrics_json: JSON.stringify(Array.isArray(input.metrics) ? input.metrics : []),
    updated_at: now,
    project_id: input.projectId ?? null
  })
  return getChat(input.date) as ChatRecord
}

/** Soft-delete: leaves a tombstone so other devices learn of the removal on next poll. */
export function softDeleteChat(date: string): void {
  stmtSoftDelete.run({ date, now: Date.now() })
}

const stmtGetSettings = db.prepare(`SELECT value_json FROM settings WHERE key = ?`)
const stmtPutSettings = db.prepare(
  `INSERT INTO settings (key, value_json, updated_at) VALUES (@key, @value_json, @updated_at)
   ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
)

/** The non-secret settings blob (empty object if never set). */
export function getSettings(): Record<string, unknown> {
  const row = stmtGetSettings.get(SETTINGS_KEY) as { value_json: string } | undefined
  if (!row) return {}
  try {
    const v = JSON.parse(row.value_json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Replace the settings blob wholesale (client sends the merged, secret-free object). */
export function putSettings(value: Record<string, unknown>): void {
  stmtPutSettings.run({
    key: SETTINGS_KEY,
    value_json: JSON.stringify(value ?? {}),
    updated_at: Date.now()
  })
}

/** Exposed for tests / graceful shutdown. */
export function closeStore(): void {
  db.close()
}
