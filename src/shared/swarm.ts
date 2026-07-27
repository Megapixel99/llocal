/**
 * Platform-agnostic "swarm" scheduling core.
 *
 * LLocal's coding agent can fan a large task out into several smaller subtasks that run
 * concurrently (inspired by https://github.com/parruda/claude-swarm). This module is the pure,
 * dependency-free brain of that feature: it validates the subtask graph, decides which subtasks
 * are ready to run, batches them under a concurrency cap, and aggregates their results.
 *
 * Like src/shared/commands.ts and src/shared/rag-core.ts it has NO Electron / DOM / Ollama
 * dependency, so it is fully unit-testable and is driven by the renderer orchestrator
 * (src/renderer/src/utils/swarm-runner.ts), which is the only part that touches the actual agent
 * loop.
 *
 * Two invariants the scheduler guarantees:
 *   1. A subtask never starts until every id in its `dependsOn` has completed.
 *   2. Two subtasks whose declared `files` intersect never run at the same time (pessimistic file
 *      locking) — this is how we avoid concurrent agents clobbering each other's edits.
 */

export type SubtaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Subtask {
  /** Unique id, referenced by other subtasks' `dependsOn`. */
  id: string
  /** Short human-readable title, shown on the card. */
  title: string
  /** The instruction handed to the coding-agent loop for this subtask. */
  prompt: string
  /** Ids of subtasks that must complete before this one may start. */
  dependsOn: string[]
  /** Paths this subtask declares it will touch — used for pessimistic file locking. */
  files: string[]
  /** Current lifecycle state. */
  status: SubtaskStatus
  /** Final transcript / summary produced by the agent loop (once done or failed). */
  result?: string
  /**
   * Optional per-subtask model override, so each subtask can run on the model that best fits it
   * (e.g. a tool-capable coder for edits, a lighter model for docs). Falls back to the swarm's
   * default model when unset.
   */
  model?: string
}

/** Live scheduling state, kept by the orchestrator and passed to the pure schedulers. */
export interface SwarmState {
  /** Ids of subtasks currently executing. */
  runningIds: string[]
  /** Ids of subtasks that finished successfully. */
  completedIds: string[]
}

export interface SwarmSummary {
  total: number
  counts: Record<SubtaskStatus, number>
  /** Per-task outcome, in graph order. */
  results: { id: string; title: string; status: SubtaskStatus; result: string }[]
  /** A ready-to-display markdown summary (counts + per-task results). */
  text: string
}

/** The model a subtask runs on: its own override when set, otherwise the swarm's default model. */
export function subtaskModel(task: Pick<Subtask, 'model'>, defaultModel: string): string {
  return task.model?.trim() || defaultModel
}

/**
 * Validate a subtask graph, throwing a clear Error on the first problem found:
 *   - duplicate subtask ids,
 *   - a `dependsOn` entry that references an unknown id,
 *   - a dependency cycle.
 *
 * Returns the same array on success so it can be used inline.
 */
export function validateGraph(subtasks: Subtask[]): Subtask[] {
  const byId = new Map<string, Subtask>()
  for (const task of subtasks) {
    if (byId.has(task.id)) throw new Error(`Duplicate subtask id: "${task.id}"`)
    byId.set(task.id, task)
  }

  // Unknown-dependency detection.
  for (const task of subtasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) throw new Error(`Subtask "${task.id}" depends on itself`)
      if (!byId.has(dep)) {
        throw new Error(`Subtask "${task.id}" depends on unknown id "${dep}"`)
      }
    }
  }

  // Cycle detection via DFS with white/gray/black colouring, tracking the path for a clear message.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const colour = new Map<string, number>(subtasks.map((task) => [task.id, WHITE]))
  const path: string[] = []

  const visit = (id: string): void => {
    colour.set(id, GRAY)
    path.push(id)
    for (const dep of byId.get(id)!.dependsOn) {
      const state = colour.get(dep)
      if (state === GRAY) {
        const cycle = path.slice(path.indexOf(dep)).concat(dep)
        throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`)
      }
      if (state === WHITE) visit(dep)
    }
    path.pop()
    colour.set(id, BLACK)
  }

  for (const task of subtasks) {
    if (colour.get(task.id) === WHITE) visit(task.id)
  }

  return subtasks
}

/** Collect every file declared by the subtasks whose ids are in `ids`. */
function lockedFilesFor(subtasks: Subtask[], ids: Iterable<string>): Set<string> {
  const idSet = ids instanceof Set ? ids : new Set(ids)
  const locked = new Set<string>()
  for (const task of subtasks) {
    if (idSet.has(task.id)) for (const file of task.files) locked.add(file)
  }
  return locked
}

/**
 * The subtasks that could be launched right now: still pending, all dependencies completed, and no
 * declared file conflicting with a currently-running subtask. This considers running subtasks only
 * — deciding whether several ready tasks can start *together* is nextBatch's job.
 */
export function readyTasks(subtasks: Subtask[], state: SwarmState): Subtask[] {
  const running = new Set(state.runningIds)
  const completed = new Set(state.completedIds)
  const lockedFiles = lockedFilesFor(subtasks, running)

  return subtasks.filter((task) => {
    if (task.status !== 'pending') return false
    if (running.has(task.id) || completed.has(task.id)) return false
    // Every dependency must have completed.
    if (!task.dependsOn.every((dep) => completed.has(dep))) return false
    // No declared file may be locked by a running task.
    if (task.files.some((file) => lockedFiles.has(file))) return false
    return true
  })
}

/**
 * The batch of subtasks to launch on this tick. Starts from readyTasks(), honours the concurrency
 * cap (maxConcurrency minus the number already running), and — crucially — never selects two tasks
 * in the same batch that share a declared file, so the file-lock invariant holds for tasks started
 * simultaneously as well as for tasks already running.
 */
export function nextBatch(
  subtasks: Subtask[],
  state: SwarmState,
  maxConcurrency: number
): Subtask[] {
  const available = Math.max(0, maxConcurrency - state.runningIds.length)
  if (available === 0) return []

  const ready = readyTasks(subtasks, state)
  // Seed the lock set with files held by running tasks, then extend it as we pick each task.
  const locked = lockedFilesFor(subtasks, state.runningIds)
  const batch: Subtask[] = []

  for (const task of ready) {
    if (batch.length >= available) break
    if (task.files.some((file) => locked.has(file))) continue
    batch.push(task)
    for (const file of task.files) locked.add(file)
  }

  return batch
}

/** Whether the whole graph has settled (nothing pending or running left). */
export function isComplete(subtasks: Subtask[], state: SwarmState): boolean {
  return nextBatch(subtasks, state, Number.MAX_SAFE_INTEGER).length === 0 && state.runningIds.length === 0
}

const STATUSES: SubtaskStatus[] = ['pending', 'running', 'done', 'failed']

/** Combine subtask outcomes into counts-by-status plus a per-task markdown summary. */
export function aggregateResults(subtasks: Subtask[]): SwarmSummary {
  const counts: Record<SubtaskStatus, number> = { pending: 0, running: 0, done: 0, failed: 0 }
  const results = subtasks.map((task) => {
    counts[task.status]++
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      result: task.result ?? ''
    }
  })

  const header = STATUSES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(', ')

  const icon: Record<SubtaskStatus, string> = {
    pending: '•',
    running: '…',
    done: '✓',
    failed: '✗'
  }

  const body = results
    .map((r) => {
      const line = `### ${icon[r.status]} ${r.title || r.id} _(${r.status})_`
      return r.result ? `${line}\n\n${r.result}` : line
    })
    .join('\n\n')

  const text = `**Swarm complete** — ${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}${
    header ? ` (${header})` : ''
  }${body ? `\n\n${body}` : ''}`

  return { total: subtasks.length, counts, results, text }
}
