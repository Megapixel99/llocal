import { describe, it, expect } from 'vitest'
import { recencyBucket, chatMatchesQuery, RECENCY_ORDER } from '../src/shared/chat-grouping'

// A fixed "now": 2026-07-28T12:00:00 local.
const now = new Date(2026, 6, 28, 12, 0, 0).getTime()
const at = (y: number, m: number, d: number, h = 10): string => new Date(y, m, d, h).toISOString()

describe('recencyBucket', () => {
  it('buckets by calendar day relative to now', () => {
    expect(recencyBucket(at(2026, 6, 28), now)).toBe('Today')
    expect(recencyBucket(at(2026, 6, 27), now)).toBe('Yesterday')
    expect(recencyBucket(at(2026, 6, 23), now)).toBe('Previous 7 days')
    expect(recencyBucket(at(2026, 6, 10), now)).toBe('Previous 30 days')
    expect(recencyBucket(at(2026, 4, 1), now)).toBe('Older')
  })
  it('earlier today still counts as Today', () => {
    expect(recencyBucket(at(2026, 6, 28, 1), now)).toBe('Today')
  })
  it('falls back to Older on an unparseable date', () => {
    expect(recencyBucket('not-a-date', now)).toBe('Older')
  })
  it('RECENCY_ORDER lists all buckets most-recent first', () => {
    expect(RECENCY_ORDER[0]).toBe('Today')
    expect(RECENCY_ORDER[RECENCY_ORDER.length - 1]).toBe('Older')
    expect(new Set(RECENCY_ORDER).size).toBe(5)
  })
})

describe('chatMatchesQuery', () => {
  const chat = { title: 'Deploy notes', chat: [{ content: 'how do I push to prod?' }, { content: 'use git push' }] }
  it('empty query matches everything', () => {
    expect(chatMatchesQuery(chat, '')).toBe(true)
    expect(chatMatchesQuery(chat, '   ')).toBe(true)
  })
  it('matches title case-insensitively', () => {
    expect(chatMatchesQuery(chat, 'deploy')).toBe(true)
  })
  it('matches message content', () => {
    expect(chatMatchesQuery(chat, 'prod')).toBe(true)
    expect(chatMatchesQuery(chat, 'GIT PUSH')).toBe(true)
  })
  it('no match returns false', () => {
    expect(chatMatchesQuery(chat, 'kubernetes')).toBe(false)
  })
})
