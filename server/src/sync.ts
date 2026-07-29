/**
 * Chat + settings sync routes (server-authoritative, single-user).
 *
 * Mounted under the shared bearer token (see index.ts), these expose the SQLite
 * store (store.ts) so every client keeps the same chat history:
 *   GET    /chats           list live chats (or ?since=<ms> for a delta incl. tombstones)
 *   GET    /chats/:date     one full chat (messages + metrics)
 *   PUT    /chats/:date     upsert a chat
 *   DELETE /chats/:date     soft-delete (tombstone)
 *   GET    /settings        non-secret settings blob
 *   PUT    /settings        replace the settings blob
 *
 * `:date` is the chat's ISO-timestamp primary key; clients must encodeURIComponent
 * it (it contains ':'). Bodies are parsed by the express.json() middleware that
 * index.ts installs before this router.
 */
import { Router } from 'express'
import {
  listChats,
  getChat,
  putChat,
  softDeleteChat,
  getSettings,
  putSettings
} from './store.ts'

export const syncRouter = Router()

syncRouter.get('/chats', (req, res) => {
  const raw = req.query.since
  if (raw === undefined) {
    res.json(listChats())
    return
  }
  const since = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(since)) {
    res.status(400).json({ error: 'since must be a number (ms since epoch)' })
    return
  }
  res.json(listChats(since))
})

syncRouter.get('/chats/:date', (req, res) => {
  const record = getChat(req.params.date)
  if (!record || record.deleted) {
    res.status(404).json({ error: 'Chat not found' })
    return
  }
  res.json(record)
})

syncRouter.put('/chats/:date', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const record = putChat({
    date: req.params.date,
    title: typeof body.title === 'string' ? body.title : '',
    unread: !!body.unread,
    chat: Array.isArray(body.chat) ? body.chat : [],
    metrics: Array.isArray(body.metrics) ? body.metrics : [],
    projectId: typeof body.projectId === 'string' ? body.projectId : null
  })
  res.json(record)
})

syncRouter.delete('/chats/:date', (req, res) => {
  softDeleteChat(req.params.date)
  res.json({ ok: true })
})

syncRouter.get('/settings', (_req, res) => {
  res.json(getSettings())
})

syncRouter.put('/settings', (req, res) => {
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'settings body must be a JSON object' })
    return
  }
  putSettings(body as Record<string, unknown>)
  res.json({ ok: true })
})
