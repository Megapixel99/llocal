/**
 * One-shot buffered command execution on the DESKTOP's own machine.
 *
 * This is the local sibling of the companion server's /exec (which the phone uses
 * to run on the paired host). It backs the code-block "Run" button on desktop.
 * Policy — the enable toggle, allowlist, and per-command approval — is enforced in
 * the renderer BEFORE this is called (see platform/runCommand.ts); this layer just
 * runs the command and buffers the result. Uses a resolved login-shell PATH so
 * commands find the same tools the user has in their terminal.
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import process from 'node:process'

const pexec = promisify(exec)

export interface ExecLocalOptions {
  command: string
  cwd?: string
}
export interface ExecLocalResult {
  stdout: string
  stderr: string
  code: number
}

/** Login-shell PATH so spawned commands find node/git/etc. (mirrors terminal.ts). */
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

export async function execLocal({ command, cwd }: ExecLocalOptions): Promise<ExecLocalResult> {
  const env = await resolvedEnv()
  try {
    const { stdout, stderr } = await pexec(command, {
      cwd: cwd && cwd.trim() ? cwd : os.homedir(),
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env
    })
    return { stdout: String(stdout), stderr: String(stderr), code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: number }
    return {
      stdout: String(e?.stdout ?? ''),
      stderr: String(e?.stderr ?? e?.message ?? err),
      code: typeof e?.code === 'number' ? e.code : 1
    }
  }
}
