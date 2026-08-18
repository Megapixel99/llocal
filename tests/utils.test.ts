import { describe, it, expect } from 'vitest'
import {
  composeAssistantMessage,
  findUrls,
  splitThinking
} from '../src/renderer/src/utils/utils'

/**
 * findUrls was relocated to utils.ts so the plain-chat web-search path and the DeepResearch agent share
 * one implementation. These guard the extraction it relies on (detecting links to scrape in a prompt).
 */
describe('findUrls', () => {
  it('extracts an http(s) URL from a sentence', () => {
    expect(findUrls('see https://example.com/page for details')).toEqual([
      'https://example.com/page'
    ])
  })

  it('extracts multiple URLs', () => {
    const urls = findUrls('compare http://a.com and https://b.org/x')
    expect(urls).toContain('http://a.com')
    expect(urls).toContain('https://b.org/x')
    expect(urls).toHaveLength(2)
  })

  it('detects bare www / domain-style links', () => {
    expect(findUrls('go to www.example.com now')).toEqual(['www.example.com'])
  })

  it('returns an empty array when there are no links', () => {
    expect(findUrls('just a normal question with no links')).toEqual([])
  })
})

/**
 * splitThinking is the inverse of composeAssistantMessage: it pulls a model's reasoning trace out of
 * a stored message so the renderer can put it in its own accordion. It has to handle the exact shape
 * composeAssistantMessage writes (no blank line after the opening tag) and the partial shape that
 * exists mid-stream, before the closing tag arrives.
 */
describe('splitThinking', () => {
  it('returns the message untouched when there is no reasoning', () => {
    expect(splitThinking('just an answer')).toEqual({ thinking: '', content: 'just an answer' })
  })

  it('splits the shape composeAssistantMessage produces', () => {
    const message = composeAssistantMessage('step one\nstep two', 'the answer')
    expect(splitThinking(message)).toEqual({ thinking: 'step one\nstep two', content: 'the answer' })
  })

  it('keeps multi-paragraph reasoning together', () => {
    const reasoning = 'first paragraph\n\nsecond paragraph\n\nthird paragraph'
    const { thinking, content } = splitThinking(composeAssistantMessage(reasoning, 'answer'))
    expect(thinking).toBe(reasoning)
    expect(content).toBe('answer')
  })

  it('treats an unterminated block as reasoning still streaming', () => {
    expect(splitThinking('<think>half a thoug')).toEqual({
      thinking: 'half a thoug',
      content: ''
    })
  })

  it('handles a reasoning-only message (no answer yet)', () => {
    expect(splitThinking(composeAssistantMessage('done thinking', ''))).toEqual({
      thinking: 'done thinking',
      content: ''
    })
  })

  it('tolerates an empty or missing message', () => {
    expect(splitThinking('')).toEqual({ thinking: '', content: '' })
    expect(splitThinking(undefined as unknown as string)).toEqual({ thinking: '', content: '' })
  })
})

describe('splitThinking with more than one block', () => {
  it('collects every reasoning block, leaving only the answer as content', () => {
    // What the reasoning flow actually produces on a thinking model: the native trace wrapped by
    // composeAssistantMessage, plus the <think> block the reasoning prompt asked the model for.
    const message = composeAssistantMessage(
      'native trace',
      '<think>prompted reasoning\n\nsecond paragraph</think>\n\nThe answer.'
    )
    expect(splitThinking(message)).toEqual({
      thinking: 'native trace\n\nprompted reasoning\n\nsecond paragraph',
      content: 'The answer.'
    })
  })

  it('keeps text that sits between blocks in the answer', () => {
    expect(splitThinking('<think>a</think>middle<think>b</think>end')).toEqual({
      thinking: 'a\n\nb',
      content: 'middleend'
    })
  })

  it('treats a trailing unterminated block as reasoning still streaming', () => {
    expect(splitThinking('<think>done</think>answer so far<think>more thinkin')).toEqual({
      thinking: 'done\n\nmore thinkin',
      content: 'answer so far'
    })
  })
})
