import { describe, it, expect } from 'vitest'
import {
  parseHarmony,
  stripHarmonyTokens,
  composeAssistantMessage
} from '../src/renderer/src/utils/utils'

/**
 * The coding-agent / reasoning work relies on cleanly separating a model's reasoning from its answer
 * and never letting raw "harmony" channel tokens reach the UI. These lock in that behavior — including
 * the malformed one-sided-pipe form observed from the gemma "agentic" GGUF fine-tune.
 */
describe('stripHarmonyTokens', () => {
  it('removes standard both-pipe markers', () => {
    expect(stripHarmonyTokens('<|channel|>final<|message|>hi<|end|>')).toBe('finalhi')
  })

  it('removes the one-sided-pipe variants some GGUF fine-tunes emit', () => {
    expect(stripHarmonyTokens('<|channel>thought <channel|>hi')).toBe('thought hi')
  })

  it('leaves ordinary angle-bracket text (HTML tags / TS generics) untouched', () => {
    const code = 'use <div> and Array<string> here'
    expect(stripHarmonyTokens(code)).toBe(code)
  })
})

describe('parseHarmony', () => {
  it('returns plain text unchanged when there are no harmony markers', () => {
    expect(parseHarmony('Just a normal answer.')).toEqual({
      thinking: '',
      content: 'Just a normal answer.'
    })
  })

  it('splits a structured analysis/final transcript into thinking + content', () => {
    const raw = '<|channel|>analysis<|message|>let me think<|channel|>final<|message|>the answer'
    expect(parseHarmony(raw)).toEqual({ thinking: 'let me think', content: 'the answer' })
  })

  it('falls back to the analysis channel when no final channel is emitted', () => {
    const raw = '<|channel|>analysis<|message|>only reasoning, no final'
    expect(parseHarmony(raw)).toEqual({
      thinking: 'only reasoning, no final',
      content: 'only reasoning, no final'
    })
  })

  it('recovers the answer from the malformed one-sided-pipe form (real gemma-fable output)', () => {
    const { thinking, content } = parseHarmony(
      '<|channel>thought\n<channel|>Hello, how can I help you today?'
    )
    expect(content).toBe('Hello, how can I help you today?')
    expect(thinking).toBe('')
  })

  it('never leaves raw channel tokens in the content', () => {
    const { content } = parseHarmony('<|channel>thought <channel|>done')
    expect(content).not.toContain('<|')
    expect(content).not.toContain('|>')
    expect(content).not.toContain('channel')
  })
})

describe('composeAssistantMessage', () => {
  it('wraps reasoning in a <think> block above the answer', () => {
    expect(composeAssistantMessage('my reasoning', 'my answer')).toBe(
      '<think>my reasoning</think>\nmy answer'
    )
  })

  it('emits only the answer when there is no reasoning', () => {
    expect(composeAssistantMessage('', 'just the answer')).toBe('just the answer')
  })

  it('emits only the think block mid-stream (reasoning present, answer not yet)', () => {
    expect(composeAssistantMessage('partial reasoning', '')).toBe(
      '<think>partial reasoning</think>'
    )
  })
})
