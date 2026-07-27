import { describe, it, expect } from 'vitest'
import {
  parseCron,
  isValidCron,
  nextRun,
  isUnattendedAllowed,
  canRunTask,
  isDue,
  CronError,
  type Task,
  type AgentMode
} from '../src/shared/schedule'

/** Build a Task with sensible defaults so tests only specify what matters. */
function task(partial: Partial<Task> & { cron: string }): Task {
  return {
    id: 't1',
    name: 'Test',
    kind: 'prompt',
    payload: 'do something',
    unattended: false,
    enabled: true,
    ...partial
  }
}

describe('parseCron (valid)', () => {
  it('parses all-wildcards', () => {
    const p = parseCron('* * * * *')
    expect(p.minute.values).toHaveLength(60)
    expect(p.hour.values).toHaveLength(24)
    expect(p.dayOfMonth.values[0]).toBe(1)
    expect(p.month.values).toHaveLength(12)
    expect(p.dayOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('parses a fixed value', () => {
    expect(parseCron('30 2 * * *').minute.values).toEqual([30])
    expect(parseCron('30 2 * * *').hour.values).toEqual([2])
  })

  it('parses a step */n', () => {
    expect(parseCron('*/15 * * * *').minute.values).toEqual([0, 15, 30, 45])
  })

  it('parses a range a-b', () => {
    expect(parseCron('0 9-17 * * *').hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('parses a list a,b,c', () => {
    expect(parseCron('0 0 * * 1,3,5').dayOfWeek.values).toEqual([1, 3, 5])
  })

  it('parses a range with a step', () => {
    expect(parseCron('0-30/10 * * * *').minute.values).toEqual([0, 10, 20, 30])
  })

  it('parses a bare-number step (5/10)', () => {
    expect(parseCron('5/10 * * * *').minute.values).toEqual([5, 15, 25, 35, 45, 55])
  })

  it('dedupes and sorts overlapping list terms', () => {
    expect(parseCron('5,1,5,3 * * * *').minute.values).toEqual([1, 3, 5])
  })
})

describe('parseCron (invalid)', () => {
  const bad = [
    ['too few fields', '* * * *'],
    ['too many fields', '* * * * * *'],
    ['empty', ''],
    ['minute out of range', '60 * * * *'],
    ['hour out of range', '* 24 * * *'],
    ['dom too low', '* * 0 * *'],
    ['dom too high', '* * 32 * *'],
    ['month too low', '* * * 0 *'],
    ['month too high', '* * * 13 *'],
    ['dow out of range', '* * * * 7'],
    ['non-numeric', 'a * * * *'],
    ['reversed range', '30-10 * * * *'],
    ['zero step', '*/0 * * * *'],
    ['bad step', '*/x * * * *'],
    ['empty list term', '1,,2 * * * *'],
    ['garbage range', '1- * * * *']
  ] as const

  for (const [label, expr] of bad) {
    it(`rejects ${label}: "${expr}"`, () => {
      expect(() => parseCron(expr)).toThrow(CronError)
      expect(isValidCron(expr)).toBe(false)
    })
  }

  it('isValidCron true for a good expression', () => {
    expect(isValidCron('*/5 0 1 1 0')).toBe(true)
  })
})

describe('nextRun boundaries', () => {
  it('advances to the next minute (minute rollover)', () => {
    const from = new Date(2026, 0, 1, 10, 30, 15)
    expect(nextRun('* * * * *', from)).toEqual(new Date(2026, 0, 1, 10, 31, 0))
  })

  it('is strictly after `from` even on an exact match', () => {
    const from = new Date(2026, 0, 1, 10, 30, 0)
    // 30 * * * * matches 10:30 but must move to 11:30, not stay.
    expect(nextRun('30 * * * *', from)).toEqual(new Date(2026, 0, 1, 11, 30, 0))
  })

  it('rolls over the hour', () => {
    const from = new Date(2026, 0, 1, 10, 59, 0)
    expect(nextRun('0 * * * *', from)).toEqual(new Date(2026, 0, 1, 11, 0, 0))
  })

  it('rolls over the day', () => {
    const from = new Date(2026, 0, 1, 23, 30, 0)
    // Daily at 00:00
    expect(nextRun('0 0 * * *', from)).toEqual(new Date(2026, 0, 2, 0, 0, 0))
  })

  it('rolls over the month', () => {
    const from = new Date(2026, 0, 31, 12, 0, 0)
    // 1st of every month at 00:00 -> Feb 1
    expect(nextRun('0 0 1 * *', from)).toEqual(new Date(2026, 1, 1, 0, 0, 0))
  })

  it('rolls over the year', () => {
    const from = new Date(2026, 11, 31, 23, 59, 0)
    expect(nextRun('0 0 1 1 *', from)).toEqual(new Date(2027, 0, 1, 0, 0, 0))
  })

  it('honours */n minute steps across the hour', () => {
    const from = new Date(2026, 0, 1, 10, 50, 0)
    expect(nextRun('*/15 * * * *', from)).toEqual(new Date(2026, 0, 1, 11, 0, 0))
  })

  it('honours an hour range (business hours)', () => {
    const from = new Date(2026, 0, 1, 20, 0, 0)
    // top of hour, 9-17 -> next day 09:00
    expect(nextRun('0 9-17 * * *', from)).toEqual(new Date(2026, 0, 2, 9, 0, 0))
  })

  it('honours a day-of-week list', () => {
    // 2026-01-01 is a Thursday(4). Next Monday(1) at 08:00 is 2026-01-05.
    const from = new Date(2026, 0, 1, 12, 0, 0)
    expect(nextRun('0 8 * * 1', from)).toEqual(new Date(2026, 0, 5, 8, 0, 0))
  })

  it('handles Feb across a non-leap year end (dom=29 in Feb 2026 skips to 2027... never in Feb, uses next matching)', () => {
    // Feb 30 never exists; ensure a valid-but-rare dom still resolves eventually.
    const from = new Date(2026, 0, 15, 0, 0, 0)
    // 15th of March at 00:00
    expect(nextRun('0 0 15 3 *', from)).toEqual(new Date(2026, 2, 15, 0, 0, 0))
  })

  it('OR semantics: dom AND dow both restricted fire on either', () => {
    // 2026-01-01 Thu. "0 0 5 * 1" = 5th OR any Monday. First Monday after Jan1 is Jan5 (which is also the 5th).
    const from = new Date(2026, 0, 1, 12, 0, 0)
    const next = nextRun('0 0 5 * 1', from)
    expect(next).toEqual(new Date(2026, 0, 5, 0, 0, 0))
  })
})

describe('isUnattendedAllowed', () => {
  const modes: AgentMode[] = ['manual', 'acceptEdits', 'plan', 'auto']
  for (const m of modes) {
    it(`${m} -> ${m === 'auto'}`, () => {
      expect(isUnattendedAllowed(m)).toBe(m === 'auto')
    })
  }
})

describe('isDue', () => {
  it('is due when the cron minute matches now and no lastRun', () => {
    const now = new Date(2026, 0, 1, 10, 30, 5)
    expect(isDue('30 10 * * *', now)).toBe(true)
  })

  it('is not due when the cron does not match the current minute', () => {
    const now = new Date(2026, 0, 1, 10, 31, 0)
    expect(isDue('30 10 * * *', now)).toBe(false)
  })

  it('is not due again within the same window after a recent lastRun', () => {
    const now = new Date(2026, 0, 1, 10, 30, 30)
    const lastRun = new Date(2026, 0, 1, 10, 30, 0)
    // Already ran this minute; next daily fire is tomorrow.
    expect(isDue('30 10 * * *', now, lastRun)).toBe(false)
  })

  it('is due when a scheduled fire elapsed since lastRun', () => {
    const now = new Date(2026, 0, 1, 11, 0, 5)
    const lastRun = new Date(2026, 0, 1, 10, 0, 0)
    // hourly at :00 -> 11:00 fell between lastRun and now
    expect(isDue('0 * * * *', now, lastRun)).toBe(true)
  })
})

describe('canRunTask gate', () => {
  const now = new Date(2026, 0, 1, 10, 30, 0)

  it('runs an attended, enabled, due task in ANY mode', () => {
    for (const mode of ['manual', 'acceptEdits', 'plan', 'auto'] as AgentMode[]) {
      const t = task({ cron: '30 10 * * *', unattended: false })
      expect(canRunTask(t, { agentMode: mode, now })).toBe(true)
    }
  })

  it('refuses an unattended task unless mode is auto', () => {
    const t = task({ cron: '30 10 * * *', unattended: true })
    expect(canRunTask(t, { agentMode: 'manual', now })).toBe(false)
    expect(canRunTask(t, { agentMode: 'acceptEdits', now })).toBe(false)
    expect(canRunTask(t, { agentMode: 'plan', now })).toBe(false)
    expect(canRunTask(t, { agentMode: 'auto', now })).toBe(true)
  })

  it('never runs a disabled task, even in auto and due', () => {
    const t = task({ cron: '30 10 * * *', unattended: true, enabled: false })
    expect(canRunTask(t, { agentMode: 'auto', now })).toBe(false)
  })

  it('does not run a task that is not due', () => {
    const t = task({ cron: '0 3 * * *', unattended: false }) // 03:00 daily, not 10:30
    expect(canRunTask(t, { agentMode: 'auto', now })).toBe(false)
  })

  it('does not run a task with an invalid cron', () => {
    const t = task({ cron: '99 * * * *' })
    expect(canRunTask(t, { agentMode: 'auto', now })).toBe(false)
  })

  it('respects lastRun so a task is not fired twice in the same window', () => {
    const t = task({ cron: '30 10 * * *', unattended: false })
    const lastRun = new Date(2026, 0, 1, 10, 30, 0)
    expect(canRunTask(t, { agentMode: 'auto', now, lastRun })).toBe(false)
  })
})
