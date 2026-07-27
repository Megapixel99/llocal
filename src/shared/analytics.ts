/**
 * Platform-agnostic token & context analytics core.
 *
 * LLocal already shows a compact "context window" meter (see
 * components/Chat/ContextInfo.tsx). This module powers a richer per-session
 * analytics view: token totals, throughput (tokens/sec), context-window growth
 * and a tool-call timeline.
 *
 * Like src/shared/commands.ts and src/shared/rag-core.ts it has NO Electron/DOM
 * dependency — it only crunches numbers, so it is trivially unit-testable and
 * can be shared by the renderer (which records the metrics) and any future host
 * consumer. Every aggregate guards against empty input and divide-by-zero.
 *
 * The raw numbers come straight from the fields Ollama returns with each
 * chat/generate response:
 *   - prompt_eval_count  -> promptTokens
 *   - eval_count         -> responseTokens
 *   - eval_duration (ns) -> evalDurationNs
 */

/** Nanoseconds per second — Ollama reports all durations in nanoseconds. */
export const NS_PER_SECOND = 1_000_000_000

/**
 * A single completed message's metrics. One is recorded each time a response
 * finishes (or a tool call runs, in which case `tool` is set).
 */
export interface MessageMetric {
  /** 'user' | 'assistant' | 'tool' — mirrors the chat message role. */
  role: string
  /** Prompt tokens the model evaluated (Ollama `prompt_eval_count`). */
  promptTokens: number
  /** Tokens the model generated (Ollama `eval_count`). */
  responseTokens: number
  /** Generation time in nanoseconds (Ollama `eval_duration`). */
  evalDurationNs: number
  /** When the metric was recorded (epoch ms). */
  timestamp: number
  /** Present when this metric represents a tool invocation; the tool's name. */
  tool?: string
  /** Optional wall-clock duration of a tool call, in milliseconds. */
  durationMs?: number
}

/** Session-wide token totals. */
export interface SessionTotals {
  promptTokens: number
  responseTokens: number
  totalTokens: number
  /** Number of metrics counted (i.e. completed messages). */
  messages: number
}

/** One point in the context-growth series (one per message). */
export interface ContextGrowthPoint {
  /** Zero-based position of the message in the session. */
  index: number
  /** Tokens this single message contributed (prompt + response). */
  messageTokens: number
  /** Running total of tokens through this message. */
  cumulativeTokens: number
  /** cumulativeTokens / contextWindow, clamped to [0, 1]; 0 when unknown. */
  utilization: number
}

/** Aggregated stats for a single tool across the session. */
export interface ToolTimelineEntry {
  tool: string
  /** How many times the tool was invoked. */
  count: number
  /** Sum of the tool calls' durations in ms (0 when no durations were recorded). */
  totalDurationMs: number
}

/** Sum prompt/response/total tokens across every metric. Empty -> all zeros. */
export function sessionTotals(metrics: MessageMetric[]): SessionTotals {
  const totals: SessionTotals = {
    promptTokens: 0,
    responseTokens: 0,
    totalTokens: 0,
    messages: 0
  }
  for (const m of metrics) {
    totals.promptTokens += m.promptTokens || 0
    totals.responseTokens += m.responseTokens || 0
    totals.messages += 1
  }
  totals.totalTokens = totals.promptTokens + totals.responseTokens
  return totals
}

/**
 * Generation throughput for a single metric, in tokens/second, from
 * eval_count / eval_duration. Returns 0 when the duration is missing or zero
 * (guarding divide-by-zero) or when no tokens were produced.
 */
export function tokensPerSecond(metric: MessageMetric): number {
  const seconds = (metric.evalDurationNs || 0) / NS_PER_SECOND
  if (seconds <= 0) return 0
  return (metric.responseTokens || 0) / seconds
}

/**
 * Average throughput across the session, in tokens/second. Computed from the
 * pooled totals (total response tokens / total generation seconds) rather than
 * averaging per-message rates, so long messages weigh more. Metrics with no
 * duration are ignored. Returns 0 when there is nothing to measure.
 */
export function averageTokensPerSecond(metrics: MessageMetric[]): number {
  let tokens = 0
  let seconds = 0
  for (const m of metrics) {
    const s = (m.evalDurationNs || 0) / NS_PER_SECOND
    if (s <= 0) continue
    tokens += m.responseTokens || 0
    seconds += s
  }
  if (seconds <= 0) return 0
  return tokens / seconds
}

/**
 * Build the cumulative context-growth series: one point per metric with the
 * running token total and its utilization of the model's context window.
 * A non-positive `contextWindow` yields utilization 0 (unknown). Utilization is
 * clamped to [0, 1]. Empty input yields an empty series.
 */
export function contextGrowthSeries(
  metrics: MessageMetric[],
  contextWindow: number
): ContextGrowthPoint[] {
  const window = contextWindow > 0 ? contextWindow : 0
  let cumulative = 0
  return metrics.map((m, index) => {
    const messageTokens = (m.promptTokens || 0) + (m.responseTokens || 0)
    cumulative += messageTokens
    const utilization = window > 0 ? Math.min(1, cumulative / window) : 0
    return { index, messageTokens, cumulativeTokens: cumulative, utilization }
  })
}

/**
 * Per-tool counts and summed durations for every metric that carries a `tool`.
 * Sorted by descending count, then tool name, for stable display. Metrics
 * without a tool are ignored; empty input yields an empty list.
 */
export function toolTimeline(metrics: MessageMetric[]): ToolTimelineEntry[] {
  const byTool = new Map<string, ToolTimelineEntry>()
  for (const m of metrics) {
    if (!m.tool) continue
    const entry = byTool.get(m.tool) ?? { tool: m.tool, count: 0, totalDurationMs: 0 }
    entry.count += 1
    entry.totalDurationMs += m.durationMs || 0
    byTool.set(m.tool, entry)
  }
  return Array.from(byTool.values()).sort(
    (a, b) => b.count - a.count || a.tool.localeCompare(b.tool)
  )
}
