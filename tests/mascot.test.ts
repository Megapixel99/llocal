import { describe, it, expect } from 'vitest'
import {
  computeMascotState,
  pickIdleActivity,
  CELEBRATE_MS,
  type IdleActivity
} from '../src/shared/mascot'

/**
 * Unit tests for the mascot state machine (src/shared/mascot.ts). Pure and
 * clock-free — `now` / elapsed time are passed in — so the state transitions
 * and idle-activity rotation are fully deterministic.
 */

describe('computeMascotState', () => {
  it('is "thinking" whenever busy, even inside a celebrate window', () => {
    expect(computeMascotState({ busy: true, now: 1000 })).toBe('thinking')
    expect(computeMascotState({ busy: true, celebrateUntil: 5000, now: 1000 })).toBe('thinking')
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
