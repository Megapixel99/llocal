/**
 * Store unit tests — run with `npm test` in server/ (Node's built-in test runner
 * via tsx, no extra deps). Uses a throwaway data dir so it never touches the real
 * ~/.llocal-server DB. Env must be set BEFORE importing config/store, hence the
 * dynamic import below.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

// Isolate the DB + satisfy config's required token, before store.ts loads config.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llocal-store-'))
process.env.LLOCAL_DATA_DIR = tmp
process.env.LLOCAL_SERVER_TOKEN = 'test'

const store = await import('./store.ts')

test('chats: upsert, list, get, unread', () => {
  const rec = store.putChat({
    date: 'A',
    title: 'Hello',
    unread: true,
    chat: [{ role: 'user', content: 'hi' }],
    metrics: [{ role: 'assistant' }]
  })
  assert.equal(rec.title, 'Hello')
  assert.equal(rec.unread, true)
  assert.equal(rec.deleted, false)

  const list = store.listChats()
  assert.equal(list.length, 1)
  assert.equal(list[0].date, 'A')

  const full = store.getChat('A')
  assert.deepEqual(full?.chat, [{ role: 'user', content: 'hi' }])
  assert.deepEqual(full?.metrics, [{ role: 'assistant' }])
})

test('chats: list is newest-first by date, tombstones hidden', () => {
  store.putChat({ date: 'B', title: 'older' })
  store.putChat({ date: 'C', title: 'newer' })
  const dates = store.listChats().map((c) => c.date)
  assert.deepEqual(dates, ['C', 'B', 'A']) // DESC by the `date` string
})

test('chats: soft-delete leaves a tombstone visible only in the delta', () => {
  store.softDeleteChat('B')
  assert.ok(!store.listChats().some((c) => c.date === 'B'), 'hidden from plain list')
  const tomb = store.listChats(0).find((c) => c.date === 'B')
  assert.equal(tomb?.deleted, true, 'surfaced as deleted in ?since=0 delta')
})

test('chats: delta returns only rows changed after `since`, oldest-first', async () => {
  const before = store.getChat('C')!.updatedAt
  // `since` is strictly-greater, so guarantee D lands in a later millisecond than
  // the boundary (Date.now() has ms resolution; back-to-back writes can collide).
  await new Promise((r) => setTimeout(r, 5))
  store.putChat({ date: 'D', title: 'brand new' })
  const delta = store.listChats(before)
  assert.ok(delta.some((c) => c.date === 'D'))
  assert.ok(!delta.some((c) => c.date === 'C'), 'C unchanged since boundary excluded')
})

test('chats: re-PUT un-deletes a tombstoned row', () => {
  store.softDeleteChat('A')
  assert.equal(store.getChat('A')?.deleted, true)
  store.putChat({ date: 'A', title: 'back' })
  assert.equal(store.getChat('A')?.deleted, false)
  assert.ok(store.listChats().some((c) => c.date === 'A'))
})

test('settings: roundtrip + empty default', () => {
  assert.deepEqual(store.getSettings(), {})
  store.putSettings({ prefModel: 'gemma4:e4b', researchEffort: 'high' })
  assert.deepEqual(store.getSettings(), { prefModel: 'gemma4:e4b', researchEffort: 'high' })
})

test.after(() => {
  store.closeStore()
  fs.rmSync(tmp, { recursive: true, force: true })
})
