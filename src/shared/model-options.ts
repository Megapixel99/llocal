/**
 * Ollama request options.
 *
 * Deliberately minimal, and the omissions are the point:
 *
 * - No `num_ctx`. Measured against Ollama 0.20.2: a request that sends no options loads the
 *   model at its full trained context (gemma4:e2b → 131072) and evaluates a 24k-token prompt
 *   in full, while the same request with `num_ctx: 4096` truncates the prompt to exactly 4096
 *   tokens. Sizing the window from the app would therefore *cap* it, and changing the value
 *   between turns makes Ollama reload the runner. Modern Ollama sizes context better than a
 *   client heuristic can, so this is left alone.
 * - No temperature/top_p for anything the user reads. Model authors ship tuned sampling in the
 *   Modelfile (gemma4 defaults to temperature 1 / top_k 64 / top_p 0.95; qwen3 disagrees, and
 *   both are right for themselves). An app-wide override would make some models worse.
 *
 * What IS pinned: sampling for internal calls whose output is parsed rather than read — intent
 * routing, search-query generation, structured output, compaction summaries. There, variance is
 * pure downside: the same conversation should route the same way twice.
 */

/** Sampling for machine-read calls: same input, same object. */
export const DETERMINISTIC_SAMPLING = { temperature: 0, top_p: 1 } as const

export interface OptionsInput {
  /** Pin sampling (internal, machine-read calls only). */
  deterministic?: boolean
  /** Cap the reply length, for internal calls that should stay short. */
  numPredict?: number
}

/**
 * Build the `options` object for an Ollama request, or undefined when there is nothing worth
 * sending — so a plain conversational call goes out exactly as it would have without this module.
 */
export function modelOptions(input: OptionsInput): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {}
  if (input.deterministic) Object.assign(options, DETERMINISTIC_SAMPLING)
  if (input.numPredict) options.num_predict = input.numPredict
  return Object.keys(options).length ? options : undefined
}

/**
 * Pull the trained context length out of an /api/show response — used to show how full the
 * context window is, not to set it. Ollama reports it under an architecture-prefixed key
 * ("llama.context_length", "gemma3.context_length", …), and model_info is a Map in current
 * builds but was a plain object in older ones.
 */
export function extractContextLength(info: {
  model_info?: Map<string, unknown> | Record<string, unknown>
}): number {
  const modelInfo = info?.model_info
  if (!modelInfo) return 0
  const entries = modelInfo instanceof Map ? modelInfo : new Map(Object.entries(modelInfo))
  for (const [key, value] of entries) {
    if (key.endsWith('.context_length')) return Number(value) || 0
  }
  return 0
}
