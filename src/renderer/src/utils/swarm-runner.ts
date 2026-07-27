import { z } from 'zod'
import { runAgentLoop, type AgentApproval, type AgentMode } from '@renderer/utils/agent'
import {
  validateGraph,
  nextBatch,
  aggregateResults,
  type Subtask,
  type SwarmSummary
} from '../../../shared/swarm'

/**
 * Renderer-side orchestrator for the "swarm" feature: it drives a subtask graph to completion,
 * running each subtask through the EXISTING coding-agent loop (src/renderer/src/utils/agent.ts)
 * with a self-implemented bounded-concurrency pool. All scheduling decisions (readiness, file
 * locking, concurrency batching) live in the pure src/shared/swarm.ts core; this file only wires
 * that brain to the actual agent loop, the approval gate, and progress callbacks.
 *
 * The bounded pool is trivial because nextBatch() already answers "what may I launch right now?":
 * we launch its batch, wait for at least one in-flight subtask to settle, then ask again. A
 * finished subtask releases its declared files (they leave `runningIds`), which is exactly when a
 * conflicting or dependent subtask becomes eligible.
 */

export interface SwarmRunOptions {
  model: string
  root: string
  /** Agent mode reused verbatim — mutating actions still go through requestApproval per this mode. */
  mode: AgentMode
  subtasks: Subtask[]
  tools: object[]
  mutating: Set<string>
  maxConcurrency: number
  requestApproval: (req: AgentApproval) => Promise<boolean>
  /** Called (with a fresh array) whenever any subtask's status or result changes. */
  onUpdate: (subtasks: Subtask[]) => void
  /** Optional live transcript for a single subtask. */
  onTaskProgress?: (id: string, transcript: string) => void
  shouldStop: () => boolean
}

/**
 * Run the whole graph. Resolves with an aggregated summary once every subtask has settled (or the
 * run was stopped). Throws synchronously from validateGraph if the graph is malformed.
 */
export async function runSwarm(opts: SwarmRunOptions): Promise<SwarmSummary> {
  const { subtasks, maxConcurrency, shouldStop } = opts
  validateGraph(subtasks)

  const emit = (): void => opts.onUpdate([...subtasks])

  // Bounded pool: id -> the in-flight promise for that subtask.
  const running = new Map<string, Promise<void>>()
  const completedIds: string[] = []

  const snapshot = (): { runningIds: string[]; completedIds: string[] } => ({
    runningIds: [...running.keys()],
    completedIds
  })

  const launch = (task: Subtask): void => {
    task.status = 'running'
    emit()
    const promise = runAgentLoop({
      model: opts.model,
      root: opts.root,
      mode: opts.mode,
      messages: [{ role: 'user', content: task.prompt }],
      tools: opts.tools,
      mutating: opts.mutating,
      requestApproval: opts.requestApproval,
      onProgress: (transcript) => opts.onTaskProgress?.(task.id, transcript),
      shouldStop
    })
      .then((result) => {
        task.status = 'done'
        task.result = result
      })
      .catch((error) => {
        task.status = 'failed'
        task.result = `Error: ${String(error)}`
      })
      .finally(() => {
        running.delete(task.id)
        // Only successful tasks unlock their dependents; a failed task's declared files are freed
        // (it's no longer running) but its id never enters completedIds, so dependents stay blocked.
        if (task.status === 'done') completedIds.push(task.id)
        emit()
      })
    running.set(task.id, promise)
  }

  // Scheduling loop.
  while (!shouldStop()) {
    for (const task of nextBatch(subtasks, snapshot(), maxConcurrency)) launch(task)
    if (running.size === 0) break // nothing running and nothing launchable -> the graph is settled
    // Wait for at least one subtask to finish before re-evaluating what's now eligible.
    await Promise.race(running.values())
  }

  // Let any in-flight subtasks wind down (they observe the same shouldStop and exit promptly).
  await Promise.allSettled(running.values())

  // Anything still pending when stopped is reported as such by aggregateResults.
  emit()
  return aggregateResults(subtasks)
}

/** Zod schema for the LLM task-decomposition step (auto-building the graph from one prompt). */
export const SwarmDecompositionSchema = z.object({
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        prompt: z.string(),
        dependsOn: z.array(z.string()).optional(),
        files: z.array(z.string()).optional()
      })
    )
    .min(1)
})

export type RawSubtask = z.infer<typeof SwarmDecompositionSchema>['subtasks'][number]

/** Normalise loose (LLM-produced) subtask objects into fully-formed, pending Subtasks. */
export function normalizeSubtasks(raw: RawSubtask[]): Subtask[] {
  return raw.map((r, i) => ({
    id: r.id?.trim() || `task-${i + 1}`,
    title: r.title?.trim() || r.id || `Task ${i + 1}`,
    prompt: r.prompt,
    dependsOn: r.dependsOn ?? [],
    files: r.files ?? [],
    status: 'pending' as const
  }))
}

const DECOMPOSE_SYSTEM = `You break a software task into a small set of subtasks that can run in parallel.
Return JSON: { "subtasks": [ { "id", "title", "prompt", "dependsOn": [ids], "files": [paths] } ] }.
- Keep it minimal (2-6 subtasks). Give each a short kebab-case id.
- "prompt" is a complete, self-contained instruction for a coding agent.
- "dependsOn" lists ids that must finish first (empty for independent work).
- "files" lists the files that subtask will create or modify — subtasks that touch the same file will NOT run at the same time, so be accurate. No cycles.`

/**
 * Optional decomposition step: ask the model to turn one high-level prompt into a subtask graph.
 * Returns validated subtasks, or throws so the caller can fall back to manual entry.
 * `getStructuredResponse` is the function returned by useStructureOutputs().
 */
export async function decomposePrompt(
  prompt: string,
  getStructuredResponse: (
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: any,
    systemPrompt?: string
  ) => Promise<{ subtasks: RawSubtask[] } | null>
): Promise<Subtask[]> {
  const parsed = await getStructuredResponse(prompt, SwarmDecompositionSchema, DECOMPOSE_SYSTEM)
  if (!parsed?.subtasks?.length) throw new Error('The model did not return any subtasks')
  const subtasks = normalizeSubtasks(parsed.subtasks)
  validateGraph(subtasks) // surface cycles / bad deps before we try to run anything
  return subtasks
}
