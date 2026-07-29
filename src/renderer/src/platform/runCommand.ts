/**
 * Unified "run one shell command" for the code-block Run button.
 *
 * Target follows the topology (decided with the user): on the DESKTOP the command
 * runs on this computer (local Electron exec); on the PHONE/web it runs on the
 * paired Mac via the companion server's token-gated /exec. Either way the caller
 * (RunCommandButton) has already required explicit approval; this layer re-checks
 * the allowlist as a hard gate and records an audit entry.
 */
import { getDefaultStore } from 'jotai'
import { isElectron } from './detect'
import { getExecPolicy } from './config'
import { execCommand, type ExecResult } from './serverClient'
import { isCommandAllowed } from '../../../shared/exec-policy'
import { workingFolderAtom } from '../store/mocks'

const store = getDefaultStore()

export interface RunResult extends ExecResult {
  /** Human-readable host the command ran on, for display + audit. */
  host: string
}

/** Where a command will run, given the platform. */
export function execTargetLabel(): string {
  return isElectron() ? 'this computer' : 'your Mac (companion server)'
}

const AUDIT_KEY = 'llocal.execAudit'
const AUDIT_MAX = 100

interface AuditEntry {
  command: string
  host: string
  code: number
  ts: number
}

/** Append an executed command to the local audit log (best-effort, capped). */
function audit(entry: AuditEntry): void {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const list: AuditEntry[] = raw ? JSON.parse(raw) : []
    list.push(entry)
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(-AUDIT_MAX)))
  } catch {
    /* best-effort */
  }
}

/** Read the audit log (newest first) for a settings/history view. */
export function readExecAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    return raw ? (JSON.parse(raw) as AuditEntry[]).reverse() : []
  } catch {
    return []
  }
}

/**
 * Run a command after re-validating policy. Throws (does NOT execute) when the
 * feature is disabled or the command isn't allowlisted — the UI shows the error.
 */
export async function runShellCommand(command: string): Promise<RunResult> {
  const { enabled, allowlist } = getExecPolicy()
  if (!enabled) throw new Error('Command execution is disabled (enable it in Settings → Server).')
  if (!isCommandAllowed(command, allowlist)) {
    throw new Error(
      `“${command.trim().split(/\s+/)[0]}” is not in your allowlist. Add it in Settings → Server → Command execution.`
    )
  }

  const host = execTargetLabel()
  let result: ExecResult
  if (isElectron()) {
    const cwd = store.get(workingFolderAtom) || undefined
    result = await window.api.execLocal({ command, cwd })
  } else {
    // Phone/web → companion server /exec (also enforces its own enable flag + allowlist).
    result = await execCommand(command)
  }
  audit({ command, host, code: result.code, ts: Date.now() })
  return { ...result, host }
}
