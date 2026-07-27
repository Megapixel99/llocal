import { describe, it, expect } from 'vitest'
import {
  validateGraph,
  readyTasks,
  nextBatch,
  aggregateResults,
  isComplete,
  subtaskModel,
  type Subtask,
  type SwarmState
} from '../src/shared/swarm'

/** Build a Subtask with sensible defaults so tests only specify what matters. */
function task(partial: Partial<Subtask> & { id: string }): Subtask {
  return {
    title: partial.id,
    prompt: `do ${partial.id}`,
    dependsOn: [],
    files: [],
    status: 'pending',
    ...partial
  }
}

const state = (runningIds: string[] = [], completedIds: string[] = []): SwarmState => ({
  runningIds,
  completedIds
})

describe('validateGraph', () => {
  it('accepts an empty graph', () => {
    expect(() => validateGraph([])).not.toThrow()
    expect(validateGraph([])).toEqual([])
  })

  it('accepts a valid linear chain', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] }), task({ id: 'c', dependsOn: ['b'] })]
    expect(() => validateGraph(graph)).not.toThrow()
  })

  it('accepts a diamond (shared dependency, no cycle)', () => {
    const graph = [
      task({ id: 'a' }),
      task({ id: 'b', dependsOn: ['a'] }),
      task({ id: 'c', dependsOn: ['a'] }),
      task({ id: 'd', dependsOn: ['b', 'c'] })
    ]
    expect(() => validateGraph(graph)).not.toThrow()
  })

  it('detects a duplicate subtask id', () => {
    const graph = [task({ id: 'a' }), task({ id: 'a' })]
    expect(() => validateGraph(graph)).toThrow(/Duplicate subtask id: "a"/)
  })

  it('detects an unknown dependency id', () => {
    const graph = [task({ id: 'a', dependsOn: ['ghost'] })]
    expect(() => validateGraph(graph)).toThrow(/unknown id "ghost"/)
  })

  it('detects a self-dependency', () => {
    const graph = [task({ id: 'a', dependsOn: ['a'] })]
    expect(() => validateGraph(graph)).toThrow(/depends on itself/)
  })

  it('detects a direct cycle', () => {
    const graph = [task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b', dependsOn: ['a'] })]
    expect(() => validateGraph(graph)).toThrow(/Dependency cycle detected/)
  })

  it('detects a longer cycle', () => {
    const graph = [
      task({ id: 'a', dependsOn: ['c'] }),
      task({ id: 'b', dependsOn: ['a'] }),
      task({ id: 'c', dependsOn: ['b'] })
    ]
    expect(() => validateGraph(graph)).toThrow(/Dependency cycle detected/)
  })
})

describe('readyTasks', () => {
  it('returns all independent tasks when nothing has run', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })]
    expect(readyTasks(graph, state()).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('withholds a task until every dependency has completed', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })]
    expect(readyTasks(graph, state([], [])).map((t) => t.id)).toEqual(['a'])
    expect(readyTasks(graph, state([], ['a'])).map((t) => t.id)).toEqual(['b'])
  })

  it('waits for ALL of multiple dependencies', () => {
    const graph = [
      task({ id: 'a' }),
      task({ id: 'b' }),
      task({ id: 'c', dependsOn: ['a', 'b'] })
    ]
    expect(readyTasks(graph, state([], ['a'])).map((t) => t.id)).toEqual(['b'])
    expect(readyTasks(graph, state([], ['a', 'b'])).map((t) => t.id)).toEqual(['c'])
  })

  it('excludes running and completed tasks', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })]
    expect(readyTasks(graph, state(['a'], ['b'])).map((t) => t.id)).toEqual(['c'])
  })

  it('excludes a pending task whose file is locked by a running task', () => {
    const graph = [
      task({ id: 'a', files: ['src/x.ts'] }),
      task({ id: 'b', files: ['src/x.ts'] }),
      task({ id: 'c', files: ['src/y.ts'] })
    ]
    // a is running and locks src/x.ts -> b is excluded, c (different file) is ready.
    expect(readyTasks(graph, state(['a'])).map((t) => t.id)).toEqual(['c'])
  })

  it('ignores non-pending tasks (already failed/done)', () => {
    const graph = [task({ id: 'a', status: 'failed' }), task({ id: 'b', status: 'done' })]
    expect(readyTasks(graph, state())).toEqual([])
  })

  it('never marks dependents of a failed task ready (failed id not in completed)', () => {
    const graph = [task({ id: 'a', status: 'failed' }), task({ id: 'b', dependsOn: ['a'] })]
    expect(readyTasks(graph, state()).map((t) => t.id)).toEqual([])
  })
})

describe('nextBatch (concurrency + file locks)', () => {
  it('returns an empty batch for an empty graph', () => {
    expect(nextBatch([], state(), 4)).toEqual([])
  })

  it('never exceeds the concurrency cap', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' }), task({ id: 'd' })]
    expect(nextBatch(graph, state(), 2).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('subtracts already-running tasks from the available slots', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })]
    // cap 2, one already running -> only one new slot.
    expect(nextBatch(graph, state(['a']), 2).map((t) => t.id)).toEqual(['b'])
  })

  it('returns nothing when the cap is already saturated', () => {
    const graph = [task({ id: 'a' }), task({ id: 'b' })]
    expect(nextBatch(graph, state(['a', 'b']), 2)).toEqual([])
  })

  it('never launches two file-conflicting tasks in the same batch', () => {
    const graph = [
      task({ id: 'a', files: ['shared.ts'] }),
      task({ id: 'b', files: ['shared.ts'] }),
      task({ id: 'c', files: ['other.ts'] })
    ]
    const batch = nextBatch(graph, state(), 5).map((t) => t.id)
    // a and b share a file: only one of them plus the non-conflicting c.
    expect(batch).toContain('a')
    expect(batch).toContain('c')
    expect(batch).not.toContain('b')
  })

  it('lets a file-conflicting task run once the holder has finished', () => {
    const graph = [
      task({ id: 'a', files: ['shared.ts'] }),
      task({ id: 'b', files: ['shared.ts'] })
    ]
    // a completed and no longer running -> b is free.
    expect(nextBatch(graph, state([], ['a']), 5).map((t) => t.id)).toEqual(['b'])
  })

  it('respects both the cap and file locks together', () => {
    const graph = [
      task({ id: 'a', files: ['f1'] }),
      task({ id: 'b', files: ['f1'] }),
      task({ id: 'c', files: ['f2'] }),
      task({ id: 'd', files: ['f3'] })
    ]
    const batch = nextBatch(graph, state(), 2).map((t) => t.id)
    expect(batch).toHaveLength(2)
    // a picked, b skipped (conflicts with a), then c fills the second slot.
    expect(batch).toEqual(['a', 'c'])
  })
})

describe('isComplete', () => {
  it('is false for a fresh graph with pending tasks', () => {
    expect(isComplete([task({ id: 'a' })], state())).toBe(false)
  })

  it('is false while a task is still running', () => {
    expect(isComplete([task({ id: 'a', status: 'running' })], state(['a']))).toBe(false)
  })

  it('is true when everything is done', () => {
    const graph = [task({ id: 'a', status: 'done' }), task({ id: 'b', status: 'done' })]
    expect(isComplete(graph, state([], ['a', 'b']))).toBe(true)
  })

  it('is true when a failed task blocks its dependents (nothing left to schedule)', () => {
    const graph = [task({ id: 'a', status: 'failed' }), task({ id: 'b', dependsOn: ['a'] })]
    expect(isComplete(graph, state())).toBe(true)
  })
})

describe('aggregateResults', () => {
  it('summarises an empty graph', () => {
    const summary = aggregateResults([])
    expect(summary.total).toBe(0)
    expect(summary.counts).toEqual({ pending: 0, running: 0, done: 0, failed: 0 })
    expect(summary.results).toEqual([])
  })

  it('counts tasks by status', () => {
    const graph = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'done' }),
      task({ id: 'c', status: 'failed' }),
      task({ id: 'd', status: 'pending' })
    ]
    const summary = aggregateResults(graph)
    expect(summary.counts).toEqual({ pending: 1, running: 0, done: 2, failed: 1 })
    expect(summary.total).toBe(4)
  })

  it('includes each task result and title in the output', () => {
    const graph = [
      task({ id: 'a', title: 'Build API', status: 'done', result: 'created routes' }),
      task({ id: 'b', title: 'Write tests', status: 'failed', result: 'compile error' })
    ]
    const summary = aggregateResults(graph)
    expect(summary.results).toEqual([
      { id: 'a', title: 'Build API', status: 'done', result: 'created routes' },
      { id: 'b', title: 'Write tests', status: 'failed', result: 'compile error' }
    ])
    expect(summary.text).toContain('Build API')
    expect(summary.text).toContain('created routes')
    expect(summary.text).toContain('compile error')
    expect(summary.text).toContain('2 subtasks')
  })
})

describe('end-to-end scheduling simulation', () => {
  it('drives a diamond graph to completion respecting deps, cap, and locks', () => {
    // a -> {b, c} -> d ; b and c both touch the same file so they cannot run together.
    const graph = [
      task({ id: 'a', files: ['a.ts'] }),
      task({ id: 'b', dependsOn: ['a'], files: ['shared.ts'] }),
      task({ id: 'c', dependsOn: ['a'], files: ['shared.ts'] }),
      task({ id: 'd', dependsOn: ['b', 'c'], files: ['d.ts'] })
    ]
    const running: string[] = []
    const completed: string[] = []
    const byId = new Map(graph.map((tk) => [tk.id, tk]))
    const launchLog: string[][] = []

    let guard = 0
    while (!isComplete(graph, { runningIds: running, completedIds: completed })) {
      if (guard++ > 50) throw new Error('scheduler did not converge')
      const batch = nextBatch(graph, { runningIds: running, completedIds: completed }, 2)
      // No batch may exceed the cap.
      expect(batch.length).toBeLessThanOrEqual(2)
      if (batch.length) {
        launchLog.push(batch.map((t) => t.id))
        for (const tk of batch) {
          running.push(tk.id)
          byId.get(tk.id)!.status = 'running'
        }
      }
      // "Finish" everything currently running (simplistic clock tick).
      for (const id of running.splice(0)) {
        completed.push(id)
        byId.get(id)!.status = 'done'
      }
    }

    expect(completed).toContain('a')
    expect(completed).toContain('d')
    expect(completed).toHaveLength(4)
    // b and c share a file: they must never appear in the same launched batch.
    for (const batch of launchLog) {
      expect(batch.includes('b') && batch.includes('c')).toBe(false)
    }
    // a is first, d is last.
    expect(launchLog[0]).toEqual(['a'])
    expect(launchLog[launchLog.length - 1]).toEqual(['d'])
  })
})

describe('subtaskModel', () => {
  it('uses the subtask override when set', () => {
    expect(subtaskModel(task({ id: 'a', model: 'qwen3-coder:30b' }), 'gemma4:e4b')).toBe(
      'qwen3-coder:30b'
    )
  })

  it('falls back to the default model when unset or blank', () => {
    expect(subtaskModel(task({ id: 'a' }), 'gemma4:e4b')).toBe('gemma4:e4b')
    expect(subtaskModel(task({ id: 'a', model: '   ' }), 'gemma4:e4b')).toBe('gemma4:e4b')
  })
})
