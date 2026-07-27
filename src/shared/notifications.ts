/**
 * Platform-agnostic core for native OS notifications.
 *
 * LLocal can raise a native notification for a handful of long-running events
 * (an agent run finishing, an action needing approval, the agent touching a
 * sensitive file, a scheduled task completing). This module has NO Electron or
 * DOM dependency — it only decides *whether* to notify and *what* the text
 * should be, mirroring how src/shared/commands.ts keeps the pure logic out of
 * the main / renderer processes so it can be shared and unit-tested.
 *
 * The Electron main process (src/main/utils/notifier.ts) applies these pure
 * policies and then actually shows an `electron.Notification`.
 */

/** The events LLocal can surface as a native notification. */
export type NotificationEvent =
  | 'agent-complete'
  | 'approval-needed'
  | 'sensitive-file-access'
  | 'scheduled-task-done'

/** Every event, in display order (drives the Preferences per-event toggles). */
export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  'agent-complete',
  'approval-needed',
  'sensitive-file-access',
  'scheduled-task-done'
] as const

/** Human-readable labels for the Preferences UI. */
export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  'agent-complete': 'Agent run completed',
  'approval-needed': 'Agent needs approval',
  'sensitive-file-access': 'Sensitive file access',
  'scheduled-task-done': 'Scheduled task done'
}

/**
 * User preferences: a global on/off plus a per-event-type toggle map. Everything
 * is opt-in — notifications stay off until the user enables them.
 */
export interface NotificationPrefs {
  /** Master switch. When false, nothing is ever shown. */
  enabled: boolean
  /** Per-event override; a missing / false entry means "don't notify". */
  events: Record<NotificationEvent, boolean>
}

/** Safe defaults: master switch off, so the feature is strictly opt-in. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  events: {
    'agent-complete': true,
    'approval-needed': true,
    // Off by default: it fires from inside file reads/writes, so it's the most
    // chatty — the user opts into it explicitly.
    'sensitive-file-access': false,
    'scheduled-task-done': true
  }
}

/** Extra data used to fill in a notification's title/body. All fields optional. */
export interface NotificationPayload {
  /** For 'agent-complete': a short summary line. */
  summary?: string
  /** For 'approval-needed': the tool the agent wants to run. */
  tool?: string
  /** A file path (sensitive-file-access) or command/path for approval. */
  path?: string
  /** For 'approval-needed' on run_command. */
  command?: string
  /** For 'scheduled-task-done': the task's name. */
  taskName?: string
  /** Fallbacks for a custom / unknown event. */
  title?: string
  body?: string
}

/**
 * Pure notification policy: honours the global switch AND the per-event toggle.
 * Note: event-specific side conditions that need process state (e.g. only
 * notifying on 'agent-complete' when the window is unfocused) live in the main
 * process — this function stays a pure, testable preference check.
 */
export function shouldNotify(event: NotificationEvent, prefs: NotificationPrefs): boolean {
  if (!prefs || !prefs.enabled) return false
  return prefs.events?.[event] === true
}

/** Build the {title, body} shown to the user for a given event + payload. */
export function formatNotification(
  event: NotificationEvent,
  payload: NotificationPayload = {}
): { title: string; body: string } {
  switch (event) {
    case 'agent-complete':
      return {
        title: 'Agent run completed',
        body: payload.summary?.trim()
          ? payload.summary.trim()
          : 'The coding agent has finished its run.'
      }
    case 'approval-needed': {
      const what = payload.command?.trim() || payload.path?.trim() || ''
      const tool = payload.tool?.trim()
      const body = tool
        ? `The agent wants to run ${tool}${what ? `: ${what}` : ''}.`
        : 'The agent is waiting for you to approve an action.'
      return { title: 'Agent needs approval', body }
    }
    case 'sensitive-file-access':
      return {
        title: 'Sensitive file access',
        body: payload.path?.trim()
          ? `The agent accessed a sensitive file: ${payload.path.trim()}`
          : 'The agent accessed a sensitive file.'
      }
    case 'scheduled-task-done':
      return {
        title: 'Scheduled task done',
        body: payload.taskName?.trim()
          ? `Scheduled task "${payload.taskName.trim()}" finished.`
          : 'A scheduled task has finished.'
      }
    default:
      return {
        title: payload.title?.trim() || 'LLocal',
        body: payload.body?.trim() || ''
      }
  }
}

/**
 * Decide whether a path points at a sensitive file: env files, anything under an
 * `.ssh` directory, private-key material (*.pem / *.key), and credential/secret
 * files. Case-insensitive and tolerant of both `/` and `\` separators so it
 * behaves the same on Windows and POSIX hosts.
 */
export function isSensitivePath(filePath: string): boolean {
  if (!filePath) return false
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const segments = normalized.split('/').filter(Boolean)
  const base = segments[segments.length - 1] ?? ''

  // .env and its variants (.env.local, .env.production, …)
  if (base === '.env' || base.startsWith('.env.')) return true
  // Private-key material.
  if (base.endsWith('.pem') || base.endsWith('.key')) return true
  // Credential / secret files, e.g. credentials, secrets.json, aws-credentials.
  if (/(^|[._-])(credentials?|secrets?)([._-]|$)/.test(base)) return true
  // Anything living under an .ssh directory (id_rsa, known_hosts, …).
  if (segments.slice(0, -1).includes('.ssh')) return true

  return false
}
