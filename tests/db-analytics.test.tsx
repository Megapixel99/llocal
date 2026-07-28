// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import React from 'react'

// t() proxies window.api.translate; stub it so the hook module loads cleanly.
;(globalThis as unknown as { window: { api: { translate: (k: string) => string } } }).window.api = {
  translate: (k: string) => k
}

// In-memory stand-in for the Localbase 'chat' collection so we can test persistence without IndexedDB.
const docs = new Map<string, Record<string, unknown>>()
vi.mock('@renderer/utils/db', () => ({
  db: {
    collection: () => ({
      add: async (doc: { date: string }) => {
        docs.set(doc.date, { ...doc })
      },
      doc: (q: { date: string }) => ({
        get: async () => docs.get(q.date),
        update: async (patch: object) => {
          docs.set(q.date, { ...(docs.get(q.date) ?? { date: q.date }), ...patch })
        },
        delete: async () => docs.delete(q.date)
      }),
      orderBy: () => ({ get: async () => [...docs.values()] })
    })
  }
}))

import { useDb } from '../src/renderer/src/hooks/useDb'
import { sessionMetricsAtom, selectedChatIndexAtom, type Message } from '../src/renderer/src/store/mocks'
import type { MessageMetric } from '../src/shared/analytics'

const metrics: MessageMetric[] = [
  { role: 'assistant', promptTokens: 10, responseTokens: 20, evalDurationNs: 1_000_000_000, timestamp: 1 }
]
const msgs: Message[] = [{ role: 'user', content: 'hi' }]

function setup() {
  const store = createStore()
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <Provider store={store}>{children}</Provider>
  )
  const { result } = renderHook(() => useDb(), { wrapper })
  return { store, result }
}

describe('useDb per-chat analytics persistence', () => {
  beforeEach(() => docs.clear())

  it('saves the live session metrics with a new chat and loads them back', async () => {
    const { store, result } = setup()
    store.set(sessionMetricsAtom, metrics)
    let date = ''
    await act(async () => {
      date = await result.current.addChat(msgs)
    })
    await expect(result.current.getMetrics(date)).resolves.toEqual(metrics)
  })

  it('updating an existing chat persists the latest metrics', async () => {
    const { store, result } = setup()
    store.set(sessionMetricsAtom, [])
    let date = ''
    await act(async () => {
      date = await result.current.addChat(msgs)
    })
    // selectedChatIndex is now this chat; a follow-up turn appends a metric, then saves.
    store.set(sessionMetricsAtom, metrics)
    store.set(selectedChatIndexAtom, date)
    await act(async () => {
      await result.current.addChat([...msgs, { role: 'assistant', content: 'hey' }])
    })
    await expect(result.current.getMetrics(date)).resolves.toEqual(metrics)
  })

  it('returns [] for a legacy chat saved before metrics existed', async () => {
    const { result } = setup()
    docs.set('legacy', { date: 'legacy', title: 'old', chat: [] }) // no metrics field
    await expect(result.current.getMetrics('legacy')).resolves.toEqual([])
  })

  it('markUnread flags the chat unread; markRead clears it (chat-menu action)', async () => {
    const { store, result } = setup()
    store.set(sessionMetricsAtom, [])
    let date = ''
    await act(async () => {
      date = await result.current.addChat(msgs)
    })
    await act(async () => {
      await result.current.markUnread(date)
    })
    expect(docs.get(date)?.unread).toBe(true)
    await act(async () => {
      await result.current.markRead(date)
    })
    expect(docs.get(date)?.unread).toBe(false)
  })
})
