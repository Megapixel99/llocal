/**
 * Main-process scheduler for unattended / scheduled tasks.
 *
 * Timing and the SAFETY GATE live here; the actual execution (running the agent
 * loop, prefilling the composer) happens in the renderer because that is where
 * Ollama and the agent tools are driven. The scheduler:
 *   - persists tasks to a JSON file under userData,
 *   - ticks on a setInterval and, for each DUE task, applies the pure-core gate
 *     (src/shared/schedule.canRunTask) against the CURRENT agent mode,
 *   - for an unattended task whose mode is not 'auto', REFUSES and surfaces a
 *     toast/console warning instead of firing,
 *   - for a permitted task, emits 'schedule:fire' to the renderer which runs it.
 *
 * The renderer keeps us informed of the live agent mode via 'schedule:set-mode'
 * so the re-check here uses the up-to-date value.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { canRunTask, isValidCron, isUnattendedAllowed, type AgentMode, type Task } from '../shared/schedule'

interface SchedulerState {
  tasks: Task[]
  /** last successful fire time per task id (ms epoch). */
  lastRun: Record<string, number>
}

const TICK_MS = 30_000 // evaluate schedules twice a minute
const REFUSAL_THROTTLE_MS = 5 * 60_000 // don't re-warn about the same blocked task more than this often

let state: SchedulerState = { tasks: [], lastRun: {} }
let currentMode: AgentMode = 'manual'
let timer: ReturnType<typeof setInterval> | null = null
let getWindow: () => BrowserWindow | null = () => null
const lastRefusalNotified: Record<string, number> = {}

function storePath(): string {
  return path.join(app.getPath('userData'), 'scheduled-tasks.json')
}

function load(): void {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SchedulerState>
    state = {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      lastRun: parsed.lastRun && typeof parsed.lastRun === 'object' ? parsed.lastRun : {}
    }
  } catch {
    // No file yet (or unreadable) — start empty.
    state = { tasks: [], lastRun: {} }
  }
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true })
    fs.writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    console.error('[scheduler] failed to persist tasks:', error)
  }
}

function notify(level: 'info' | 'success' | 'error' | 'warning', message: string): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('schedule:notify', { level, message })
  } else {
    // Degrade gracefully when no window / notifications feature is present.
    console.log(`[scheduler:${level}] ${message}`)
  }
}

/** Ask the renderer to actually execute this task (attended = prefill; unattended = run agent). */
function fire(task: Task): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('schedule:fire', task)
  } else {
    console.warn(`[scheduler] no window to fire task "${task.name}"`)
  }
}

/** Evaluate every task and fire / refuse the due ones. */
function tick(): void {
  const now = new Date()
  for (const task of state.tasks) {
    if (!task.enabled || !isValidCron(task.cron)) continue

    const last = state.lastRun[task.id] ? new Date(state.lastRun[task.id]) : undefined

    // Unattended-but-blocked: surface a throttled warning without firing.
    if (task.unattended && !isUnattendedAllowed(currentMode)) {
      // Only warn if it WOULD be due now (ignoring the gate), to avoid noise.
      const wouldRun = canRunTask({ ...task, unattended: false }, { agentMode: currentMode, now, lastRun: last })
      if (wouldRun) {
        const lastWarn = lastRefusalNotified[task.id] ?? 0
        if (now.getTime() - lastWarn > REFUSAL_THROTTLE_MS) {
          lastRefusalNotified[task.id] = now.getTime()
          notify(
            'warning',
            `Scheduled task "${task.name}" needs Auto agent mode to run unattended — skipped.`
          )
        }
      }
      continue
    }

    if (canRunTask(task, { agentMode: currentMode, now, lastRun: last })) {
      state.lastRun[task.id] = now.getTime()
      persist()
      fire(task)
    }
  }
}

/** Register IPC handlers and start the interval. Call once from app.whenReady. */
export function initScheduler(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  load()

  ipcMain.handle('schedule:list', async (): Promise<Task[]> => state.tasks)

  ipcMain.handle('schedule:save', async (_event, task: Task): Promise<Task[]> => {
    if (!task || typeof task.id !== 'string') throw new Error('Invalid task')
    const idx = state.tasks.findIndex((existing) => existing.id === task.id)
    if (idx === -1) state.tasks.push(task)
    else state.tasks[idx] = task
    persist()
    return state.tasks
  })

  ipcMain.handle('schedule:delete', async (_event, id: string): Promise<Task[]> => {
    state.tasks = state.tasks.filter((existing) => existing.id !== id)
    delete state.lastRun[id]
    persist()
    return state.tasks
  })

  ipcMain.handle('schedule:run-now', async (_event, id: string): Promise<boolean> => {
    const task = state.tasks.find((existing) => existing.id === id)
    if (!task) return false
    // Manual run bypasses due-ness, but still honours the unattended safety gate.
    if (task.unattended && !isUnattendedAllowed(currentMode)) {
      notify('warning', `"${task.name}" is unattended — switch to Auto agent mode to run it.`)
      return false
    }
    state.lastRun[task.id] = Date.now()
    persist()
    fire(task)
    return true
  })

  // The renderer pushes the live agent mode so the gate re-check uses it.
  ipcMain.handle('schedule:set-mode', async (_event, mode: AgentMode): Promise<void> => {
    currentMode = mode
  })

  timer = setInterval(tick, TICK_MS)
}

/** Stop the interval (used on quit / for cleanliness). */
export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
