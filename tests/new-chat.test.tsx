// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import React from 'react'

// getOllama() builds a real Ollama client (and reads config); the button only needs abort(),
// so stub the module to keep this a focused, network-free component test.
const abort = vi.fn()
vi.mock('@renderer/utils/ollama', () => ({ getOllama: () => ({ abort }) }))

// t() proxies to window.api.translate (the Electron/web preload bridge), absent in tests.
// Stub it to echo the key so components can render.
;(globalThis as unknown as { window: { api: { translate: (k: string) => string } } }).window.api = {
  translate: (k: string) => k
}

import { NewChat } from '../src/renderer/src/components/Sidebar/NewChat'
import {
  chatAtom,
  contextUsageAtom,
  selectedChatIndexAtom,
  sessionMetricsAtom,
  stopGeneratingAtom,
  streamingAtom,
  suggestionsAtom
} from '../src/renderer/src/store/mocks'

/**
 * Regression guard for "Start a chat seems broken": streamingAtom is the streaming *text buffer*,
 * and the button used to be gated on it being empty. A generation that errored out left the buffer
 * non-empty forever, permanently disabling the button. The button must now always return the app to
 * a fresh, idle chat — clearing the stream buffer and stop flag included — regardless of prior state.
 */
describe('NewChat ("Start a chat")', () => {
  beforeEach(() => {
    abort.mockClear()
    cleanup()
  })

  function renderWithDirtyState() {
    const store = createStore()
    // Simulate a chat mid-flight that errored: a stuck stream buffer + leftover state.
    store.set(streamingAtom, 'partial reply that never finished')
    store.set(stopGeneratingAtom, true)
    store.set(chatAtom, [{ role: 'user', content: 'hello' }])
    store.set(selectedChatIndexAtom, 'abc123')
    store.set(suggestionsAtom, { show: true, prompts: ['a', 'b'] })
    store.set(contextUsageAtom, { used: 4200, total: 8192 })
    store.set(sessionMetricsAtom, [{ anything: true } as never])
    const utils = render(
      <Provider store={store}>
        <NewChat />
      </Provider>
    )
    return { store, ...utils }
  }

  it('resets to a fresh chat even when a stream buffer is stuck (the old dead-button bug)', () => {
    const { store, getByText } = renderWithDirtyState()

    fireEvent.click(getByText('Start a chat'))

    // The two fields the old error path forgot — these are what blocked the button.
    expect(store.get(streamingAtom)).toBe('')
    expect(store.get(stopGeneratingAtom)).toBe(false)
    // ...and the rest of the fresh-chat reset.
    expect(store.get(chatAtom)).toEqual([])
    expect(store.get(selectedChatIndexAtom)).toBe('')
    expect(store.get(suggestionsAtom).prompts).toEqual([])
    expect(store.get(contextUsageAtom).used).toBe(0)
    expect(store.get(sessionMetricsAtom)).toEqual([])
  })

  it('aborts any in-flight generation when starting fresh', () => {
    const { getByText } = renderWithDirtyState()
    fireEvent.click(getByText('Start a chat'))
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('preserves unrelated fields (suggestions.show, context total)', () => {
    const { store, getByText } = renderWithDirtyState()
    fireEvent.click(getByText('Start a chat'))
    // Reset clears prompts/used but must not clobber sibling fields.
    expect(store.get(suggestionsAtom).show).toBe(true)
    expect(store.get(contextUsageAtom).total).toBe(8192)
  })
})
