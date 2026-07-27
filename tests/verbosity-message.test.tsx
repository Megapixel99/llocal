// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import React from 'react'

// t() proxies window.api.translate; the action-bar children below aren't relevant to reasoning
// display and pull in heavier deps, so stub them out to keep this focused on the <think> renderer.
;(globalThis as unknown as { window: { api: { translate: (k: string) => string } } }).window.api = {
  translate: (k: string) => k
}
vi.mock('@renderer/ui/CopyButton', () => ({ CopyButton: () => null }))
vi.mock('@renderer/components/Chat/Messages/TextToSpeech', () => ({ TextToSpeech: () => null }))
vi.mock('@renderer/components/Chat/Messages/ExportDocument', () => ({ ExportDocument: () => null }))
vi.mock('@renderer/components/Chat/Messages/Branch', () => ({ Branch: () => null }))

import { AiMessage } from '../src/renderer/src/ui/Message'
import { verbosityAtom, Verbosity } from '../src/renderer/src/store/mocks'

// Multi-paragraph, like a real reasoning trace — react-markdown yields an array of block children
// (which the <think> renderer requires); a single text node would be dropped as non-reasoning.
const REASON_MARK = 'Reason line A'
const REASONING = `${REASON_MARK}.\n\nReason line B.`
const ANSWER = 'FINAL_ANSWER_TEXT'
// Blank lines around the reasoning so markdown parses it into its own block children (an array) —
// the shape a real multi-paragraph reasoning trace produces and that the <think> renderer requires.
const MESSAGE = `<think>\n\n${REASONING}\n\n</think>\n\n${ANSWER}`

function renderAt(verbosity: Verbosity) {
  const store = createStore()
  store.set(verbosityAtom, verbosity)
  return render(
    <Provider store={store}>
      <AiMessage message={MESSAGE} stream={false} />
    </Provider>
  )
}

/**
 * The reasoning-verbosity selector is display-only: it changes how a model's <think> block is shown,
 * never what the model generated. These lock in the four modes' distinct render behavior.
 */
describe('AiMessage reasoning display (verbosity)', () => {
  beforeEach(() => cleanup())

  it('summary: hides the reasoning entirely, keeps the answer', () => {
    const { container } = renderAt('summary')
    expect(container.textContent).toContain(ANSWER)
    expect(container.textContent).not.toContain(REASON_MARK)
    expect(container.textContent).not.toContain('Chain of thought')
  })

  it('normal: reasoning in a collapsed "Chain of thought" accordion', () => {
    const { container } = renderAt('normal')
    expect(container.textContent).toContain(REASON_MARK) // in the DOM...
    expect(container.textContent).toContain('Chain of thought')
    expect(container.innerHTML).toContain('grid-rows-[0fr]') // ...but collapsed
  })

  it('thinking: reasoning in an expanded accordion', () => {
    const { container } = renderAt('thinking')
    expect(container.textContent).toContain(REASON_MARK)
    expect(container.textContent).toContain('Chain of thought')
    expect(container.innerHTML).toContain('grid-rows-[1fr]') // open
    expect(container.innerHTML).not.toContain('grid-rows-[0fr]')
  })

  it('verbose: reasoning shown inline, not inside an accordion', () => {
    const { container } = renderAt('verbose')
    expect(container.textContent).toContain(REASON_MARK)
    expect(container.textContent).toContain(ANSWER)
    expect(container.textContent).not.toContain('Chain of thought') // no accordion chrome
  })
})
