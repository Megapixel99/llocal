// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { canCompact, applyCompaction, KEEP_RECENT, SUMMARY_MARKER } from '../src/renderer/src/utils/compact'
import type { Message } from '../src/renderer/src/store/mocks'

const mk = (n: number): Message[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))

describe('compaction', () => {
  it('canCompact only when there is older history beyond the kept tail', () => {
    expect(canCompact(mk(KEEP_RECENT + 1))).toBe(false)
    expect(canCompact(mk(KEEP_RECENT + 2))).toBe(true)
    expect(canCompact([])).toBe(false)
  })

  it('applyCompaction replaces old turns with one summary + keeps the recent tail', () => {
    const msgs = mk(10)
    const out = applyCompaction(msgs, 'the summary')
    expect(out.length).toBe(KEEP_RECENT + 1)
    expect(out[0].content.startsWith(SUMMARY_MARKER)).toBe(true)
    expect(out[0].content).toContain('the summary')
    // the kept tail is the last KEEP_RECENT original messages, in order
    expect(out.slice(1)).toEqual(msgs.slice(-KEEP_RECENT))
  })

  it('is a no-op when nothing to compact or summary is blank', () => {
    const few = mk(3)
    expect(applyCompaction(few, 'x')).toBe(few)
    const many = mk(10)
    expect(applyCompaction(many, '   ')).toBe(many)
  })
})
