/**
 * Interactive terminal runner (main process).
 *
 * The coding-agent's non-interactive `run_command` (src/main/utils/agent-tools.ts)
 * buffers a whole command and returns once it exits. This runner is its interactive
 * sibling: it `spawn`s a child, STREAMS stdout/stderr back to the renderer as they
 * arrive, forwards keystrokes to the child's stdin, and lets the user kill it — so
 * long-running / prompting commands can be watched and driven live.
 *
 * Uses only Node built-ins (child_process, crypto). Streaming crosses the IPC
 * boundary as 'terminal:data' / 'terminal:exit' events; the pure line-assembly /
 * ANSI / state logic lives in src/shared/terminal.ts and runs in the renderer.
 */
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import process from 'node:process'
import type { WebContents } from 'electron'

export interface StartTerminalOptions {
  command: string
  /** Working directory; defaults to the caller's default (the workspace folder). */
  cwd?: string
}

interface Session {
  child: ChildProcess
}

const sessions = new Map<string, Session>()

/**
 * Resolve a login-shell PATH via shell-path so spawned commands find the same
 * tools the user has in their terminal (node, git, etc.), mirroring main's fixPath.
 */
async function resolvedEnv(): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env }
  if (process.platform !== 'win32') {
    try {
      const { shellPathSync } = await import('shell-path')
      const p = shellPathSync()
      if (p) env.PATH = p
    } catch {
      /* fall back to the inherited PATH */
    }
  }
  return env
}

/**
 * Spawn a command through the platform shell and stream its output to `sender`.
 * Returns a session id used by writeTerminal / killTerminal and echoed on events.
 */
export async function startTerminal(
  sender: WebContents,
  { command, cwd }: StartTerminalOptions
): Promise<string> {
  if (!command || !command.trim()) throw new Error('A command is required')

  const env = await resolvedEnv()
  const sessionId = randomUUID()
  const isWin = process.platform === 'win32'
  const shell = isWin ? process.env.COMSPEC || 'cmd.exe' : '/bin/sh'
  const args = isWin ? ['/c', command] : ['-c', command]

  const child = spawn(shell, args, {
    cwd: cwd || undefined,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  const send = (channel: string, payload: unknown): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }

  child.stdout?.on('data', (d: Buffer) => send('terminal:data', { sessionId, chunk: d.toString() }))
  child.stderr?.on('data', (d: Buffer) => send('terminal:data', { sessionId, chunk: d.toString() }))

  child.on('error', (err) => {
    send('terminal:data', { sessionId, chunk: `\n[error] ${err.message}\n` })
    sessions.delete(sessionId)
    send('terminal:exit', { sessionId, code: null })
  })

  child.on('close', (code) => {
    sessions.delete(sessionId)
    send('terminal:exit', { sessionId, code })
  })

  sessions.set(sessionId, { child })
  return sessionId
}

/** Forward user input (e.g. an Enter-terminated line) to the child's stdin. */
export function writeTerminal(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId)
  if (!session?.child.stdin || session.child.stdin.destroyed) return false
  session.child.stdin.write(data)
  return true
}

/** Terminate a running session. Returns false if the session is already gone. */
export function killTerminal(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.child.kill()
  return true
}
