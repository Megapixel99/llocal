/**
 * Platform-agnostic core for scheduled / unattended tasks.
 *
 * Like src/shared/commands.ts, this module has NO filesystem, Electron or DOM
 * dependency — it is pure logic (a tiny cron parser + a due/gate calculator) so
 * it can be unit-tested in isolation and shared by:
 *   - the Electron main process (src/main/scheduler.ts fires due tasks), and
 *   - the renderer (components/Settings/ScheduledTasks.tsx previews next runs).
 *
 * A "task" schedules a prompt or a slash command on a 5-field cron expression.
 * Tasks may be UNATTENDED (run autonomously via the agent loop) — but that is
 * ONLY permitted when the agent mode is 'auto'. That safety gate lives here in
 * `isUnattendedAllowed` / `canRunTask` so both processes enforce it identically.
 */

/** The agent modes LLocal supports (mirrors store/mocks `agentMode`). */
export type AgentMode = 'manual' | 'acceptEdits' | 'plan' | 'auto'

/** What a scheduled task runs: a raw prompt, or a slash command invocation. */
export type TaskKind = 'prompt' | 'command'

export interface Task {
  /** Stable unique id. */
  id: string
  /** Human readable name shown in the UI. */
  name: string
  /** Whether `payload` is a prompt or a slash command. */
  kind: TaskKind
  /** The prompt text or command invocation to run. */
  payload: string
  /** 5-field cron expression (min hour dom month dow). */
  cron: string
  /** Run autonomously (no user) — only honoured when agent mode is 'auto'. */
  unattended: boolean
  /** Disabled tasks never run. */
  enabled: boolean
}

/** A parsed cron field: the sorted set of matching values within its range. */
export interface CronField {
  values: number[]
}

export interface ParsedCron {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

interface FieldSpec {
  min: number
  max: number
  name: string
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: 'minute' },
  { min: 0, max: 23, name: 'hour' },
  { min: 1, max: 31, name: 'day-of-month' },
  { min: 1, max: 12, name: 'month' },
  { min: 0, max: 6, name: 'day-of-week' }
]

/** Thrown by parseCron on an invalid expression. */
export class CronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CronError'
  }
}

/** Parse a single field (`*`, `* /n`, `a-b`, `a,b,c`, or combinations) into its matching values. */
function parseField(raw: string, spec: FieldSpec): CronField {
  const field = raw.trim()
  if (field === '') throw new CronError(`Empty ${spec.name} field`)

  const values = new Set<number>()

  for (const part of field.split(',')) {
    const token = part.trim()
    if (token === '') throw new CronError(`Empty term in ${spec.name} field`)

    // Split off an optional step (e.g. "*/5" or "1-10/2").
    let step = 1
    let rangePart = token
    const slash = token.indexOf('/')
    if (slash !== -1) {
      rangePart = token.slice(0, slash).trim()
      const stepStr = token.slice(slash + 1).trim()
      if (!/^\d+$/.test(stepStr)) throw new CronError(`Invalid step '${stepStr}' in ${spec.name} field`)
      step = Number(stepStr)
      if (step === 0) throw new CronError(`Step cannot be zero in ${spec.name} field`)
    }

    let start: number
    let end: number
    if (rangePart === '*') {
      start = spec.min
      end = spec.max
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-')
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) {
        throw new CronError(`Invalid range '${rangePart}' in ${spec.name} field`)
      }
      start = Number(a)
      end = Number(b)
      if (start > end) throw new CronError(`Range start > end '${rangePart}' in ${spec.name} field`)
    } else {
      if (!/^\d+$/.test(rangePart)) {
        throw new CronError(`Invalid value '${rangePart}' in ${spec.name} field`)
      }
      start = Number(rangePart)
      // A bare number with a step (e.g. "5/10") means "from 5 to max, step".
      end = slash !== -1 ? spec.max : start
    }

    if (start < spec.min || end > spec.max) {
      throw new CronError(
        `Value out of range in ${spec.name} field (expected ${spec.min}-${spec.max})`
      )
    }

    for (let v = start; v <= end; v += step) values.add(v)
  }

  return { values: Array.from(values).sort((a, b) => a - b) }
}

/**
 * Parse a 5-field cron expression. Throws CronError on any invalid input.
 * Fields: minute(0-59) hour(0-23) day-of-month(1-31) month(1-12) day-of-week(0-6).
 */
export function parseCron(expr: string): ParsedCron {
  if (typeof expr !== 'string') throw new CronError('Cron expression must be a string')
  const fields = expr.trim().split(/\s+/)
  if (expr.trim() === '') throw new CronError('Empty cron expression')
  if (fields.length !== 5) {
    throw new CronError(`Expected 5 fields, got ${fields.length}`)
  }

  return {
    minute: parseField(fields[0], FIELD_SPECS[0]),
    hour: parseField(fields[1], FIELD_SPECS[1]),
    dayOfMonth: parseField(fields[2], FIELD_SPECS[2]),
    month: parseField(fields[3], FIELD_SPECS[3]),
    dayOfWeek: parseField(fields[4], FIELD_SPECS[4])
  }
}

/** True if `expr` parses without error. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr)
    return true
  } catch {
    return false
  }
}

/**
 * Whether a cron day matches. Standard cron semantics: when both day-of-month
 * and day-of-week are restricted (not `*`), a day matches if EITHER matches.
 * When one is `*` (unrestricted), only the other constrains the day.
 */
function dayMatches(parsed: ParsedCron, date: Date, domUnrestricted: boolean, dowUnrestricted: boolean): boolean {
  const dom = parsed.dayOfMonth.values.includes(date.getDate())
  const dow = parsed.dayOfWeek.values.includes(date.getDay())
  if (domUnrestricted && dowUnrestricted) return true
  if (domUnrestricted) return dow
  if (dowUnrestricted) return dom
  return dom || dow
}

/**
 * The next fire time STRICTLY AFTER `from`, in local time.
 *
 * `from` is always supplied by the caller — this function never reads the
 * clock, so it is deterministic and testable. Handles minute/hour/day/month
 * rollover. Throws CronError on an invalid expression.
 */
export function nextRun(expr: string, from: Date): Date {
  const parsed = parseCron(expr)
  const domUnrestricted = isWildcard(expr, 2)
  const dowUnrestricted = isWildcard(expr, 4)

  // Start at the next whole minute after `from` (seconds/ms cleared).
  const candidate = new Date(from.getTime())
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  // Bound the search generously (~5 years of minutes) to avoid an infinite loop
  // on a pathological but valid expression (e.g. Feb 30 never fires).
  const LIMIT = 5 * 366 * 24 * 60
  for (let i = 0; i < LIMIT; i++) {
    const month = candidate.getMonth() + 1
    if (!parsed.month.values.includes(month)) {
      // Jump to the first day of next month at 00:00.
      candidate.setMonth(candidate.getMonth() + 1, 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }
    if (!dayMatches(parsed, candidate, domUnrestricted, dowUnrestricted)) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }
    if (!parsed.hour.values.includes(candidate.getHours())) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0)
      continue
    }
    if (!parsed.minute.values.includes(candidate.getMinutes())) {
      candidate.setMinutes(candidate.getMinutes() + 1, 0, 0)
      continue
    }
    return candidate
  }

  throw new CronError('No next run found within search window')
}

/** Whether the Nth field (0-based) of an expression is a bare wildcard `*`. */
function isWildcard(expr: string, index: number): boolean {
  const fields = expr.trim().split(/\s+/)
  return fields[index] === '*'
}

/** Unattended (autonomous) execution is ONLY allowed in 'auto' mode. */
export function isUnattendedAllowed(agentMode: AgentMode): boolean {
  return agentMode === 'auto'
}

/**
 * What the renderer should do when the main-process scheduler fires a task:
 *   - 'prefill' — attended task: drop its prompt into the composer for the user;
 *   - 'run'     — unattended task allowed to run autonomously (agent mode 'auto');
 *   - 'blocked' — unattended task refused because the mode isn't 'auto' (the same
 *                 safety gate as `isUnattendedAllowed`, re-checked defensively in
 *                 the renderer since the mode can change between fire and handling).
 *
 * Only a task that actually RUNS ('run') completes, so it is the one that should
 * raise the 'scheduled-task-done' notification once its agent run finishes.
 */
export type FiredTaskAction = 'run' | 'prefill' | 'blocked'

export function firedTaskAction(task: Task, agentMode: AgentMode): FiredTaskAction {
  if (!task.unattended) return 'prefill'
  return isUnattendedAllowed(agentMode) ? 'run' : 'blocked'
}

/**
 * Decide whether a task should fire right now.
 *
 * A task runs when it is ENABLED and DUE (its cron produced a fire time at or
 * before `now`, since `lastRun` if given, otherwise anchored one step before
 * `now`) — and, if it is UNATTENDED, only when the agent mode permits it
 * (`isUnattendedAllowed`). An unattended task in any non-'auto' mode is refused.
 */
export function canRunTask(
  task: Task,
  ctx: { agentMode: AgentMode; now: Date; lastRun?: Date }
): boolean {
  if (!task.enabled) return false
  if (!isValidCron(task.cron)) return false

  if (task.unattended && !isUnattendedAllowed(ctx.agentMode)) return false

  return isDue(task.cron, ctx.now, ctx.lastRun)
}

/**
 * Whether `cron` has a scheduled fire time in (lastRun, now]. When `lastRun` is
 * omitted we anchor the window just before `now` (one minute back), so a task
 * whose cron matches the current minute is considered due on first evaluation.
 */
export function isDue(cron: string, now: Date, lastRun?: Date): boolean {
  const anchor = lastRun ?? new Date(now.getTime() - 60_000)
  // A run strictly after the anchor that lands at or before `now` means due.
  const next = nextRun(cron, anchor)
  return next.getTime() <= now.getTime()
}
