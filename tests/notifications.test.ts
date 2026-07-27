import { describe, it, expect } from 'vitest'
import {
  shouldNotify,
  formatNotification,
  isSensitivePath,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs
} from '../src/shared/notifications'

/** Build prefs with sensible defaults so tests only specify what matters. */
function prefs(partial: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    enabled: true,
    events: {
      'agent-complete': true,
      'approval-needed': true,
      'sensitive-file-access': true,
      'scheduled-task-done': true
    },
    ...partial
  }
}

describe('shouldNotify', () => {
  it('is false when the master switch is off (even if the event is enabled)', () => {
    expect(shouldNotify('agent-complete', prefs({ enabled: false }))).toBe(false)
  })

  it('is true when both the global switch and the per-event toggle are on', () => {
    expect(shouldNotify('agent-complete', prefs())).toBe(true)
  })

  it('honours the per-event toggle when globally enabled', () => {
    const p = prefs({
      events: {
        'agent-complete': false,
        'approval-needed': true,
        'sensitive-file-access': false,
        'scheduled-task-done': true
      }
    })
    expect(shouldNotify('agent-complete', p)).toBe(false)
    expect(shouldNotify('approval-needed', p)).toBe(true)
    expect(shouldNotify('sensitive-file-access', p)).toBe(false)
    expect(shouldNotify('scheduled-task-done', p)).toBe(true)
  })

  it('defaults are opt-in (master switch off)', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.enabled).toBe(false)
    expect(shouldNotify('agent-complete', DEFAULT_NOTIFICATION_PREFS)).toBe(false)
  })

  it('tolerates a missing event entry', () => {
    const p = { enabled: true, events: {} } as unknown as NotificationPrefs
    expect(shouldNotify('agent-complete', p)).toBe(false)
  })
})

describe('formatNotification', () => {
  it('formats agent-complete with and without a summary', () => {
    expect(formatNotification('agent-complete')).toEqual({
      title: 'Agent run completed',
      body: 'The coding agent has finished its run.'
    })
    expect(formatNotification('agent-complete', { summary: 'Refactored auth' })).toEqual({
      title: 'Agent run completed',
      body: 'Refactored auth'
    })
  })

  it('formats approval-needed including the tool and command', () => {
    const { title, body } = formatNotification('approval-needed', {
      tool: 'run_command',
      command: 'rm -rf build'
    })
    expect(title).toBe('Agent needs approval')
    expect(body).toBe('The agent wants to run run_command: rm -rf build.')
  })

  it('formats approval-needed with a generic body when no tool is given', () => {
    expect(formatNotification('approval-needed').body).toBe(
      'The agent is waiting for you to approve an action.'
    )
  })

  it('formats sensitive-file-access with the path', () => {
    expect(formatNotification('sensitive-file-access', { path: '.env' })).toEqual({
      title: 'Sensitive file access',
      body: 'The agent accessed a sensitive file: .env'
    })
  })

  it('formats scheduled-task-done with and without a name', () => {
    expect(formatNotification('scheduled-task-done', { taskName: 'Nightly sync' }).body).toBe(
      'Scheduled task "Nightly sync" finished.'
    )
    expect(formatNotification('scheduled-task-done').body).toBe('A scheduled task has finished.')
  })
})

describe('isSensitivePath', () => {
  it('matches env files and their variants', () => {
    expect(isSensitivePath('.env')).toBe(true)
    expect(isSensitivePath('config/.env.local')).toBe(true)
    expect(isSensitivePath('/app/.env.production')).toBe(true)
  })

  it('matches private-key material', () => {
    expect(isSensitivePath('certs/server.pem')).toBe(true)
    expect(isSensitivePath('keys/id_rsa.key')).toBe(true)
  })

  it('matches credential and secret files', () => {
    expect(isSensitivePath('credentials')).toBe(true)
    expect(isSensitivePath('config/secrets.json')).toBe(true)
    expect(isSensitivePath('aws-credentials')).toBe(true)
  })

  it('matches anything under an .ssh directory', () => {
    expect(isSensitivePath('/home/user/.ssh/id_rsa')).toBe(true)
    expect(isSensitivePath('.ssh/known_hosts')).toBe(true)
  })

  it('handles Windows-style separators (case-insensitive)', () => {
    expect(isSensitivePath('C:\\Users\\Me\\.ssh\\id_rsa')).toBe(true)
    expect(isSensitivePath('C:\\project\\.ENV')).toBe(true)
    expect(isSensitivePath('C:\\secrets\\Prod.PEM')).toBe(true)
  })

  it('does not match ordinary files', () => {
    expect(isSensitivePath('src/index.ts')).toBe(false)
    expect(isSensitivePath('README.md')).toBe(false)
    expect(isSensitivePath('environment.ts')).toBe(false)
    expect(isSensitivePath('keyboard.tsx')).toBe(false)
    expect(isSensitivePath('monkey.txt')).toBe(false)
    expect(isSensitivePath('')).toBe(false)
  })
})
