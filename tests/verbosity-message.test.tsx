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
import { composeAssistantMessage } from '../src/renderer/src/utils/utils'
import { verbosityAtom, Verbosity } from '../src/renderer/src/store/mocks'

// Multi-paragraph, like a real reasoning trace.
const REASON_MARK = 'Reason line A'
const REASON_TAIL = 'Reason line B'
const REASONING = `${REASON_MARK}.\n\n${REASON_TAIL}.`
const ANSWER = 'FINAL_ANSWER_TEXT'
// Built with composeAssistantMessage so the tests see exactly what the app stores. An earlier
// version of this file hand-wrote blank lines around the reasoning, which happened to keep the old
// raw-<think> renderer working and hid the bug where every paragraph after the first escaped the
// accordion and rendered as part of the answer.
const MESSAGE = composeAssistantMessage(REASONING, ANSWER)

function renderAt(verbosity: Verbosity, stream = false) {
  const store = createStore()
  store.set(verbosityAtom, verbosity)
  return render(
    <Provider store={store}>
      <AiMessage message={MESSAGE} stream={stream} />
    </Provider>
  )
}

/** The collapsible body of the accordion, whichever state it is in. */
function accordionBody(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[class*="grid-rows-"]')
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

  it('normal: the WHOLE reasoning trace stays inside the collapsed accordion', () => {
    const { container } = renderAt('normal')
    const body = accordionBody(container)
    // Every paragraph, not just the first — the regression this guards.
    expect(body?.textContent).toContain(REASON_MARK)
    expect(body?.textContent).toContain(REASON_TAIL)
    // ...and none of it leaks into the answer alongside it.
    expect(body?.textContent).not.toContain(ANSWER)
  })

  it('normal: expands while streaming, collapses once the answer lands', () => {
    const streaming = renderAt('normal', true)
    expect(streaming.container.innerHTML).toContain('grid-rows-[1fr]')
    expect(streaming.container.textContent).toContain('Thinking')
    cleanup()
    const done = renderAt('normal')
    expect(done.container.innerHTML).toContain('grid-rows-[0fr]')
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
