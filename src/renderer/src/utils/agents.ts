/**
 * DeepResearch and Reasoning agents.
 *
 * These are NOT surfaced as a manual toggle — the plain Chat flow routes each message to the right
 * behavior ("the AI just knows"). `routeIntent` classifies the message; `runReasoning` does prompt-based
 * step-by-step thinking (works on any model); `runDeepResearch` runs bounded iterative web searches and
 * synthesizes a cited answer. All reuse the existing pieces: `getOllama()`, `parseHarmony`/
 * `composeAssistantMessage` (so reasoning renders in the "Chain of thought" accordion), `findUrls`, and
 * `window.api.experimentalSearch` (desktop IPC or, on mobile, the companion server — identical shape).
 */
import { getOllama } from '@renderer/utils/ollama'
import { composeAssistantMessage, findUrls, parseHarmony } from '@renderer/utils/utils'
import { streamPhase, type BusyPhase } from '../../../shared/mascot'
import type { Effort, Message } from '@renderer/store/mocks'

export type Intent = 'chat' | 'reason' | 'research'

// DeepResearch breadth per effort level: how many sub-queries per round, and how many rounds.
export const EFFORT: Record<Effort, { queries: number; rounds: number }> = {
  low: { queries: 2, rounds: 1 },
  medium: { queries: 3, rounds: 2 },
  high: { queries: 5, rounds: 3 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ollama = ReturnType<typeof getOllama>

/**
 * Streams a chat completion, forwarding a composed (reasoning + answer) markdown string to `onProgress`
 * on every chunk, and returns the final composed string. Mirrors the plain-chat streaming in usePrompt:
 * tries `think: true` first, falls back if the model rejects it, and recovers harmony-token reasoning.
 */
async function streamComposed(
  ollama: Ollama,
  model: string,
  messages: { role: string; content: string }[],
  onProgress: (composed: string) => void,
  shouldStop: () => boolean,
  prefix = '',
  onPhase?: (phase: BusyPhase) => void
): Promise<string> {
  let response
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response = await ollama.chat({ model, messages: messages as any, stream: true, think: true })
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response = await ollama.chat({ model, messages: messages as any, stream: true })
  }

  let chunk = ''
  let thinking = ''
  for await (const part of response) {
    chunk += part.message.content ?? ''
    if (part.message.thinking) thinking += part.message.thinking

    if (shouldStop()) {
      ollama.abort()
      break
    }
    // Tell the mascot whether we're still reasoning or writing the answer.
    onPhase?.(streamPhase(chunk, thinking.length))
    const parsed = parseHarmony(chunk)
    onProgress(prefix + composeAssistantMessage(thinking || parsed.thinking, parsed.content))
    if (part.done) break
  }

  const parsed = parseHarmony(chunk)
  return composeAssistantMessage(thinking || parsed.thinking, parsed.content)
}

/** Best-effort JSON generate: returns parsed JSON or null (never throws). */
async function generateJson(
  ollama: Ollama,
  model: string,
  prompt: string,
  numPredict?: number
): Promise<unknown | null> {
  try {
    const res = await ollama.generate({
      model,
      prompt,
      stream: false,
      format: 'json',
      ...(numPredict ? { options: { num_predict: numPredict } } : {})
    })
    return JSON.parse(res.response)
  } catch {
    return null
  }
}

/**
 * Classify a message into chat | reason | research. Biased toward plain chat; fails safe to 'chat' so a
 * flaky/small model can never block the conversation. Kept cheap (tiny output).
 */
export async function routeIntent(model: string, prompt: string): Promise<Intent> {
  const routerPrompt = `You are a router that decides how to best answer a user's message. Choose ONE:
- "research": needs up-to-date facts, current events, statistics, or looking things up on the web (or the message contains a link to read).
- "reason": a hard analytical, mathematical, logical, or multi-step problem that benefits from careful step-by-step thinking.
- "chat": everything else — greetings, casual conversation, opinions, creative writing, or simple questions the model already knows.
Prefer "chat" unless the message clearly needs the web ("research") or careful reasoning ("reason").
Respond with strict JSON: {"intent": "chat" | "reason" | "research"}.

User message: """${prompt}"""`

  const parsed = (await generateJson(getOllama(), model, routerPrompt, 20)) as {
    intent?: string
  } | null
  const intent = parsed?.intent
  if (intent === 'research' || intent === 'reason' || intent === 'chat') return intent
  return 'chat'
}

/**
 * Prompt-based step-by-step reasoning that works on any model. Injects a system prompt asking the model to
 * think inside a <think> block, then answer. Reasoning renders in the existing Chain-of-thought accordion.
 */
export async function runReasoning(opts: {
  model: string
  messages: Message[]
  /** User custom instructions / style, appended to the reasoning system prompt. */
  instructions?: string
  onProgress: (composed: string) => void
  shouldStop: () => boolean
  onPhase?: (phase: BusyPhase) => void
}): Promise<string> {
  const { model, messages, instructions, onProgress, shouldStop, onPhase } = opts
  onPhase?.('reading')
  const system = {
    role: 'system',
    content:
      `You are a careful reasoning assistant. For the user's problem:
1. Put your full step-by-step reasoning inside a single <think>...</think> block: restate the problem, break it into sub-steps, work through each, and double-check your logic for mistakes.
2. After </think>, give a clear, well-structured final answer. Do NOT repeat the raw reasoning in the answer — summarize conclusions.
Always include the <think> block, even for short problems.` +
      (instructions ? `\n\nAdditional user instructions:\n${instructions}` : '')
  }
  return streamComposed(getOllama(), model, [system, ...messages], onProgress, shouldStop, '', onPhase)
}

/**
 * Iterative web research bounded by effort. Generates sub-queries, searches each via
 * window.api.experimentalSearch, optionally does follow-up rounds to fill gaps, then synthesizes a cited
 * answer. `onProgress` shows a live "searching…" transcript followed by the streaming answer.
 */
export async function runDeepResearch(opts: {
  model: string
  prompt: string
  effort: Effort
  /** User custom instructions / style, appended to the synthesis system prompt. */
  instructions?: string
  onProgress: (composed: string) => void
  shouldStop: () => boolean
  onPhase?: (phase: BusyPhase) => void
}): Promise<{ content: string; sources: string }> {
  const { model, prompt, effort, instructions, onProgress, shouldStop, onPhase } = opts
  const ollama = getOllama()
  const { queries: perRound, rounds } = EFFORT[effort]
  // The whole search sweep is "reading"; synthesis below flips to "responding".
  onPhase?.('reading')

  const evidence: string[] = []
  const sourceLines: string[] = []
  const askedQueries = new Set<string>()
  let transcript = `**🔬 Researching** _(effort: ${effort})_\n`
  onProgress(transcript)

  const runQueries = async (queries: string[]): Promise<void> => {
    for (const q of queries) {
      if (shouldStop()) return
      const query = q.trim()
      if (!query || askedQueries.has(query.toLowerCase())) continue
      askedQueries.add(query.toLowerCase())
      transcript += `\n🔎 ${query}`
      onProgress(transcript)
      try {
        const res = await window.api.experimentalSearch(query, findUrls(query))
        if (res?.prompt) evidence.push(`# Query: ${query}\n${res.prompt}`)
        if (res?.sources && !sourceLines.includes(res.sources)) sourceLines.push(res.sources)
      } catch (error) {
        transcript += ` — _search failed: ${String(error)}_`
        onProgress(transcript)
      }
    }
  }

  // Round 1: sub-queries derived from the user's prompt.
  const first = (await generateJson(
    ollama,
    model,
    `Break the user's request into ${perRound} focused web-search queries that together will answer it. Respond with strict JSON: {"queries": string[]}.
User request: """${prompt}"""`
  )) as { queries?: unknown } | null
  const firstQueries = Array.isArray(first?.queries)
    ? (first!.queries as unknown[]).map(String).slice(0, perRound)
    : [prompt]
  await runQueries(firstQueries)

  // Further rounds: ask for follow-up queries that fill gaps, given what we've found so far.
  for (let round = 2; round <= rounds && !shouldStop(); round++) {
    const follow = (await generateJson(
      ollama,
      model,
      `Given the research so far, list up to ${perRound} NEW web-search queries for important gaps still unanswered. If the question is already well covered, return an empty array. Strict JSON: {"queries": string[]}.
Original request: """${prompt}"""
Findings so far:
${evidence.join('\n\n').slice(0, 6000)}`
    )) as { queries?: unknown } | null
    const followQueries = Array.isArray(follow?.queries)
      ? (follow!.queries as unknown[]).map(String).slice(0, perRound)
      : []
    if (followQueries.length === 0) break
    await runQueries(followQueries)
  }

  const sources = sourceLines.join('\n')

  if (shouldStop()) {
    return { content: transcript + '\n\n_Stopped._', sources }
  }

  // Synthesis: stream a cited answer from the accumulated evidence.
  transcript += `\n\n---\n\n`
  onProgress(transcript)
  const synthesisMessages = [
    {
      role: 'system',
      content:
        `You are a research assistant. Using ONLY the search findings provided, write a clear, well-structured answer to the user's question. Cite claims inline with the linked source titles where possible. If the findings are insufficient, say so honestly. Do not fabricate facts or URLs.` +
        (instructions ? `\n\nAdditional user instructions:\n${instructions}` : '')
    },
    {
      role: 'user',
      content: `Question: ${prompt}\n\nSearch findings:\n${evidence.join('\n\n').slice(0, 12000)}`
    }
  ]
  const answer = await streamComposed(
    ollama,
    model,
    synthesisMessages,
    onProgress,
    shouldStop,
    transcript,
    onPhase
  )

  return { content: answer, sources }
}
