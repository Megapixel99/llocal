import { describe, it, expect } from 'vitest'
import {
  sessionTotals,
  tokensPerSecond,
  averageTokensPerSecond,
  contextGrowthSeries,
  toolTimeline,
  NS_PER_SECOND,
  type MessageMetric
} from '../src/shared/analytics'

/** Build a MessageMetric with sensible defaults so tests only set what matters. */
function metric(partial: Partial<MessageMetric> = {}): MessageMetric {
  return {
    role: 'assistant',
    promptTokens: 0,
    responseTokens: 0,
    evalDurationNs: 0,
    timestamp: 0,
    ...partial
  }
}

/** Seconds -> nanoseconds, the unit Ollama reports durations in. */
const sec = (s: number): number => s * NS_PER_SECOND

describe('sessionTotals', () => {
  it('sums prompt, response and total tokens over all metrics', () => {
    const totals = sessionTotals([
      metric({ promptTokens: 100, responseTokens: 20 }),
      metric({ promptTokens: 130, responseTokens: 40 })
    ])
    expect(totals).toEqual({
      promptTokens: 230,
      responseTokens: 60,
      totalTokens: 290,
      messages: 2
    })
  })

  it('returns all zeros for no metrics', () => {
    expect(sessionTotals([])).toEqual({
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
      messages: 0
    })
  })
})

describe('tokensPerSecond', () => {
  it('divides response tokens by the eval duration in seconds', () => {
    expect(tokensPerSecond(metric({ responseTokens: 50, evalDurationNs: sec(2) }))).toBe(25)
  })

  it('returns 0 when the duration is zero (no divide-by-zero)', () => {
    expect(tokensPerSecond(metric({ responseTokens: 50, evalDurationNs: 0 }))).toBe(0)
  })

  it('returns 0 when no tokens were produced', () => {
    expect(tokensPerSecond(metric({ responseTokens: 0, evalDurationNs: sec(1) }))).toBe(0)
  })
})

describe('averageTokensPerSecond', () => {
  it('pools total tokens over total seconds', () => {
    // 30 tokens in 1s + 30 tokens in 2s => 60 tokens / 3s = 20 tok/s
    const avg = averageTokensPerSecond([
      metric({ responseTokens: 30, evalDurationNs: sec(1) }),
      metric({ responseTokens: 30, evalDurationNs: sec(2) })
    ])
    expect(avg).toBe(20)
  })

  it('ignores metrics with zero duration', () => {
    const avg = averageTokensPerSecond([
      metric({ responseTokens: 40, evalDurationNs: sec(2) }),
      metric({ responseTokens: 999, evalDurationNs: 0 })
    ])
    expect(avg).toBe(20)
  })

  it('returns 0 for no metrics', () => {
    expect(averageTokensPerSecond([])).toBe(0)
  })

  it('returns 0 when every metric has zero duration', () => {
    expect(averageTokensPerSecond([metric({ responseTokens: 10, evalDurationNs: 0 })])).toBe(0)
  })
})

describe('contextGrowthSeries', () => {
  it('accumulates tokens and reports utilization of the window', () => {
    const series = contextGrowthSeries(
      [
        metric({ promptTokens: 100, responseTokens: 0 }),
        metric({ promptTokens: 100, responseTokens: 100 })
      ],
      1000
    )
    expect(series).toEqual([
      { index: 0, messageTokens: 100, cumulativeTokens: 100, utilization: 0.1 },
      { index: 1, messageTokens: 200, cumulativeTokens: 300, utilization: 0.3 }
    ])
  })

  it('clamps utilization to 1 when the context overflows', () => {
    const series = contextGrowthSeries([metric({ promptTokens: 2000, responseTokens: 0 })], 1000)
    expect(series[0].utilization).toBe(1)
  })

  it('reports utilization 0 when the context window is unknown (<= 0)', () => {
    const series = contextGrowthSeries([metric({ promptTokens: 100, responseTokens: 50 })], 0)
    expect(series[0].cumulativeTokens).toBe(150)
    expect(series[0].utilization).toBe(0)
  })

  it('returns an empty series for no metrics', () => {
    expect(contextGrowthSeries([], 1000)).toEqual([])
  })
})

describe('toolTimeline', () => {
  it('counts invocations and sums durations per tool, sorted by count', () => {
    const timeline = toolTimeline([
      metric({ role: 'tool', tool: 'read_file', durationMs: 10 }),
      metric({ role: 'tool', tool: 'run_command', durationMs: 500 }),
      metric({ role: 'tool', tool: 'read_file', durationMs: 30 })
    ])
    expect(timeline).toEqual([
      { tool: 'read_file', count: 2, totalDurationMs: 40 },
      { tool: 'run_command', count: 1, totalDurationMs: 500 }
    ])
  })

  it('ignores metrics without a tool', () => {
    const timeline = toolTimeline([
      metric({ role: 'assistant', responseTokens: 5 }),
      metric({ role: 'tool', tool: 'search' })
    ])
    expect(timeline).toEqual([{ tool: 'search', count: 1, totalDurationMs: 0 }])
  })

  it('breaks ties on equal counts by tool name', () => {
    const timeline = toolTimeline([
      metric({ role: 'tool', tool: 'zeta' }),
      metric({ role: 'tool', tool: 'alpha' })
    ])
    expect(timeline.map((e) => e.tool)).toEqual(['alpha', 'zeta'])
  })

  it('returns an empty list for no metrics', () => {
    expect(toolTimeline([])).toEqual([])
  })
})
