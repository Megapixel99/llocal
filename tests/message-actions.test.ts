// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { computeRetry, computeEdit } from '../src/renderer/src/hooks/useMessageActions'
import type { Message } from '../src/renderer/src/store/mocks'

const chat: Message[] = [
  { role: 'user', content: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'q2' },
  { role: 'assistant', content: 'a2' }
]

describe('computeRetry', () => {
  it('re-runs the user prompt just before the assistant reply, on the history before it', () => {
    // retry a2 (index 3) → re-run q2 (index 2) on [q1, a1]
    expect(computeRetry(chat, 3)).toEqual({
      prompt: 'q2',
      baseChat: [chat[0], chat[1]]
    })
  })

  it('handles the first reply (base becomes empty)', () => {
    expect(computeRetry(chat, 1)).toEqual({ prompt: 'q1', baseChat: [] })
  })

  it('returns null when there is no preceding user message', () => {
    expect(computeRetry([{ role: 'assistant', content: 'orphan' }], 0)).toBeNull()
  })
})

describe('computeEdit', () => {
  it('replaces the user message and truncates everything from it onward', () => {
    // edit q2 (index 2) → run new text on [q1, a1]
    expect(computeEdit(chat, 2, 'q2-edited')).toEqual({
      prompt: 'q2-edited',
      baseChat: [chat[0], chat[1]]
    })
  })

  it('editing the first message runs on an empty base', () => {
    expect(computeEdit(chat, 0, 'new first')).toEqual({ prompt: 'new first', baseChat: [] })
  })

  it('ignores an empty/whitespace edit', () => {
    expect(computeEdit(chat, 2, '   ')).toBeNull()
  })
})
