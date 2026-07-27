import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the DeepResearch / Reasoning agents (src/renderer/src/utils/agents.ts).
 *
 * The agents talk to Ollama via getOllama() and to the host via window.api.experimentalSearch, so we
 * mock both: `getOllama` returns a fake client whose `generate`/`chat` we drive per-test, and
 * `window.api` is stubbed globally. This lets us assert the orchestration logic — intent fallback,
 * effort-bounded search counts, query/source dedup, stop handling — without any network or model.
 */

// Fake Ollama client, shared by the mock factory and reconfigured per test.
const generate = vi.fn()
const chat = vi.fn()
const abort = vi.fn()

vi.mock('@renderer/utils/ollama', () => ({
  getOllama: () => ({ generate, chat, abort, show: vi.fn() })
}))

// Import AFTER vi.mock so the mock is applied.
import { routeIntent, runReasoning, runDeepResearch, EFFORT } from '../src/renderer/src/utils/agents'

/** Build an async-iterable chat stream from a list of parts (mirrors ollama's streaming shape). */
async function* streamOf(
  parts: { content?: string; thinking?: string; done?: boolean }[]
): AsyncGenerator<{ message: { content?: string; thinking?: string }; done?: boolean }> {
  for (const p of parts) {
    yield { message: { content: p.content, thinking: p.thinking }, done: p.done }
  }
}

/** JSON `generate` result in the shape generateJson expects. */
function jsonResponse(obj: unknown): { response: string } {
  return { response: JSON.stringify(obj) }
}

const experimentalSearch = vi.fn()

beforeEach(() => {
  generate.mockReset()
  chat.mockReset()
  abort.mockReset()
  experimentalSearch.mockReset()
  experimentalSearch.mockResolvedValue({ prompt: 'ctx', sources: '[s](http://x)' })
  vi.stubGlobal('window', { api: { experimentalSearch } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EFFORT', () => {
  it('scales search breadth with the effort level', () => {
    expect(EFFORT.low.queries).toBeLessThan(EFFORT.medium.queries)
    expect(EFFORT.medium.queries).toBeLessThan(EFFORT.high.queries)
    expect(EFFORT.low.rounds).toBeLessThanOrEqual(EFFORT.medium.rounds)
    expect(EFFORT.medium.rounds).toBeLessThanOrEqual(EFFORT.high.rounds)
  })
})

describe('routeIntent', () => {
  it('returns a valid intent chosen by the model', async () => {
    generate.mockResolvedValue(jsonResponse({ intent: 'research' }))
    expect(await routeIntent('m', 'what is the latest news')).toBe('research')
  })

  it('passes through reason', async () => {
    generate.mockResolvedValue(jsonResponse({ intent: 'reason' }))
    expect(await routeIntent('m', 'prove that ...')).toBe('reason')
  })

  it('falls back to chat on an unknown intent', async () => {
    generate.mockResolvedValue(jsonResponse({ intent: 'banana' }))
    expect(await routeIntent('m', 'hi')).toBe('chat')
  })

  it('falls back to chat on invalid JSON', async () => {
    generate.mockResolvedValue({ response: 'not json' })
    expect(await routeIntent('m', 'hi')).toBe('chat')
  })

  it('falls back to chat when the model call throws', async () => {
    generate.mockRejectedValue(new Error('model down'))
    expect(await routeIntent('m', 'hi')).toBe('chat')
  })
})

describe('runReasoning', () => {
  it('streams and returns reasoning composed into a <think> block', async () => {
    chat.mockReturnValue(streamOf([{ content: 'The answer', thinking: 'step 1', done: true }]))
    const progress: string[] = []
    const result = await runReasoning({
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
      onProgress: (t) => progress.push(t),
      shouldStop: () => false
    })
    expect(result).toContain('<think>step 1</think>')
    expect(result).toContain('The answer')
    expect(progress.length).toBeGreaterThan(0)
  })

  it('injects a system prompt asking for a <think> block', async () => {
    chat.mockReturnValue(streamOf([{ content: 'a', done: true }]))
    await runReasoning({ model: 'm', messages: [{ role: 'user', content: 'q' }], onProgress: () => {}, shouldStop: () => false })
    const sentMessages = chat.mock.calls[0][0].messages
    expect(sentMessages[0].role).toBe('system')
    expect(sentMessages[0].content).toContain('<think>')
  })
})

describe('runDeepResearch', () => {
  it('runs at most `queries` searches for the effort level (low = 1 round)', async () => {
    // Round-1 sub-queries: 4 offered, but low effort caps at 2.
    generate.mockResolvedValueOnce(jsonResponse({ queries: ['a', 'b', 'c', 'd'] }))
    chat.mockReturnValue(streamOf([{ content: 'report', done: true }]))

    await runDeepResearch({
      model: 'm',
      prompt: 'research this',
      effort: 'low',
      onProgress: () => {},
      shouldStop: () => false
    })

    expect(experimentalSearch).toHaveBeenCalledTimes(EFFORT.low.queries)
  })

  it('deduplicates repeated queries', async () => {
    generate.mockResolvedValueOnce(jsonResponse({ queries: ['same', 'same'] }))
    chat.mockReturnValue(streamOf([{ content: 'report', done: true }]))

    await runDeepResearch({
      model: 'm',
      prompt: 'x',
      effort: 'low',
      onProgress: () => {},
      shouldStop: () => false
    })

    expect(experimentalSearch).toHaveBeenCalledTimes(1)
  })

  it('deduplicates identical source strings and returns them', async () => {
    generate.mockResolvedValueOnce(jsonResponse({ queries: ['q1', 'q2'] }))
    experimentalSearch.mockResolvedValue({ prompt: 'ctx', sources: '[same](http://same)' })
    chat.mockReturnValue(streamOf([{ content: 'report', done: true }]))

    const { content, sources } = await runDeepResearch({
      model: 'm',
      prompt: 'x',
      effort: 'low',
      onProgress: () => {},
      shouldStop: () => false
    })

    expect(content).toContain('report')
    expect(sources).toBe('[same](http://same)') // both queries produced the same source → deduped to one
  })

  it('stops before searching when shouldStop is already true', async () => {
    generate.mockResolvedValueOnce(jsonResponse({ queries: ['a', 'b'] }))

    const { content } = await runDeepResearch({
      model: 'm',
      prompt: 'x',
      effort: 'low',
      onProgress: () => {},
      shouldStop: () => true
    })

    expect(experimentalSearch).not.toHaveBeenCalled()
    expect(chat).not.toHaveBeenCalled() // never reaches synthesis
    expect(content).toContain('Stopped')
  })

  it('falls back to the raw prompt as a single query when sub-query JSON is unusable', async () => {
    generate.mockResolvedValueOnce({ response: 'not json' })
    chat.mockReturnValue(streamOf([{ content: 'report', done: true }]))

    await runDeepResearch({
      model: 'm',
      prompt: 'the original request',
      effort: 'low',
      onProgress: () => {},
      shouldStop: () => false
    })

    expect(experimentalSearch).toHaveBeenCalledTimes(1)
    expect(experimentalSearch.mock.calls[0][0]).toBe('the original request')
  })
})
