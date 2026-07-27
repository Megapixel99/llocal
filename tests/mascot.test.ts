import { describe, it, expect } from 'vitest'
import {
  computeMascotState,
  pickIdleActivity,
  streamPhase,
  CELEBRATE_MS,
  type IdleActivity
} from '../src/shared/mascot'

/**
 * Unit tests for the mascot state machine (src/shared/mascot.ts). Pure and
 * clock-free — `now` / elapsed time are passed in — so the state transitions
 * and idle-activity rotation are fully deterministic.
 */

describe('computeMascotState', () => {
  it('picks the busy pose from the phase, even inside a celebrate window', () => {
    // default when the phase is unknown (e.g. the coding agent) is responding
    expect(computeMascotState({ busy: true, now: 1000 })).toBe('responding')
    expect(computeMascotState({ busy: true, phase: 'reading', now: 1000 })).toBe('reading')
    expect(computeMascotState({ busy: true, phase: 'responding', now: 1000 })).toBe('responding')
    // busy always wins over a pending celebrate window
    expect(computeMascotState({ busy: true, phase: 'reading', celebrateUntil: 5000, now: 1000 })).toBe('reading')
  })

  it('celebrates until the celebrate window elapses', () => {
    expect(computeMascotState({ busy: false, celebrateUntil: 5000, now: 4999 })).toBe('celebrate')
    // boundary: at exactly celebrateUntil it is no longer celebrating
    expect(computeMascotState({ busy: false, celebrateUntil: 5000, now: 5000 })).toBe('idle')
    expect(computeMascotState({ busy: false, celebrateUntil: 5000, now: 5001 })).toBe('idle')
  })

  it('idles when not busy and no (or expired) celebrate window', () => {
    expect(computeMascotState({ busy: false, now: 1000 })).toBe('idle')
    expect(computeMascotState({ busy: false, celebrateUntil: 0, now: 1000 })).toBe('idle')
  })

  it('exposes a positive celebrate duration', () => {
    expect(CELEBRATE_MS).toBeGreaterThan(0)
  })
})

describe('streamPhase', () => {
  it('is reading while inside an unclosed <think> block', () => {
    expect(streamPhase('<think>let me work this out', 0)).toBe('reading')
    expect(streamPhase('<think>step 1\nstep 2', 0)).toBe('reading')
  })

  it('is responding once answer text follows a closed think block', () => {
    expect(streamPhase('<think>reasoning</think>Here is the answer', 0)).toBe('responding')
  })

  it('stays reading after </think> until real answer text appears', () => {
    expect(streamPhase('<think>done</think>', 0)).toBe('reading')
    expect(streamPhase('<think>done</think>   \n ', 0)).toBe('reading')
  })

  it('uses separate reasoning tokens: reading when only thinking, no content yet', () => {
    expect(streamPhase('', 42)).toBe('reading')
  })

  it('is responding when plain answer content is streaming (no think block)', () => {
    expect(streamPhase('The sky is blue because', 0)).toBe('responding')
  })

  it('handles empty input as reading (about to start)', () => {
    expect(streamPhase('', 0)).toBe('reading')
  })
})

describe('pickIdleActivity', () => {
  it('starts at rest', () => {
    expect(pickIdleActivity(0)).toBe('rest')
    expect(pickIdleActivity(100)).toBe('rest')
  })

  it('advances one step per period and cycles', () => {
    const period = 5000
    // The cycle is a fixed pattern of length 6; sample one value per bucket.
    const seq: IdleActivity[] = []
    for (let i = 0; i < 6; i++) seq.push(pickIdleActivity(i * period + 1, period))
    expect(seq).toEqual(['rest', 'rest', 'peek', 'rest', 'play', 'rest'])
    // wraps back around after a full cycle
    expect(pickIdleActivity(6 * period + 1, period)).toBe('rest')
    expect(pickIdleActivity(8 * period + 1, period)).toBe('peek')
  })

  it('only ever returns rest, peek, or play', () => {
    const allowed = new Set<IdleActivity>(['rest', 'peek', 'play'])
    for (let ms = 0; ms < 60000; ms += 700) {
      expect(allowed.has(pickIdleActivity(ms))).toBe(true)
    }
  })

  it('clamps negative elapsed time and guards a non-positive period', () => {
    expect(pickIdleActivity(-1000)).toBe('rest')
    expect(pickIdleActivity(1234, 0)).toBe('rest') // falls back to a sane default period
  })
})
