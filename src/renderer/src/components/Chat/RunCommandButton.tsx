import { useState } from 'react'
import { LuPlay, LuAlertTriangle, LuRefreshCw } from 'react-icons/lu'
import { Portal, t } from '@renderer/utils/utils'
import { Card } from '@renderer/ui/Card'
import { Button } from '@renderer/ui/Button'
import { getExecPolicy } from '@renderer/platform/config'
import { runShellCommand, execTargetLabel, type RunResult } from '@renderer/platform/runCommand'
import { isCommandAllowed } from '../../../../shared/exec-policy'

type Phase = 'confirm' | 'running' | 'done'

/**
 * "Run" affordance on a shell code block. Approve-each + allowlisted: opens a
 * dialog showing the exact command and target host, blocks anything not on the
 * allowlist, and only executes on explicit confirm. Output is shown in-dialog.
 * Rendered only when execution is enabled (see Code.tsx).
 */
export function RunCommandButton({ command }: { command: string }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { allowlist } = getExecPolicy()
  const allowed = isCommandAllowed(command, allowlist)
  const host = execTargetLabel()
  const trimmed = command.trim()

  function openDialog(): void {
    setPhase('confirm')
    setResult(null)
    setError(null)
    setOpen(true)
  }

  async function run(): Promise<void> {
    setPhase('running')
    setError(null)
    try {
      setResult(await runShellCommand(command))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('done')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={t('Run this command')}
        className="flex cursor-pointer items-center gap-1 text-xs opacity-75 transition-opacity hover:opacity-100"
      >
        <LuPlay /> {t('Run')}
      </button>

      {open &&
        Portal(
          <>
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
            <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
              <Card className="flex w-[min(92vw,560px)] max-h-[85vh] flex-col gap-3 overflow-auto rounded-2xl p-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <LuPlay /> {t('Run command')}
                </h2>
                <p className="text-xs opacity-70">
                  {t('Runs on')} <b>{host}</b>
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 text-xs">
                  {trimmed}
                </pre>

                {!allowed && (
                  <p className="flex items-start gap-1 text-xs text-amber-500">
                    <LuAlertTriangle className="mt-0.5 shrink-0" />
                    <span>
                      {t(
                        'This command isn’t in your allowlist. Add its first word under Settings → Server → Command execution to run it.'
                      )}
                    </span>
                  </p>
                )}

                {phase === 'done' && error && (
                  <p className="break-all text-xs text-red-500">{error}</p>
                )}
                {phase === 'done' && !error && result && <Output result={result} />}

                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    {phase === 'done' ? t('Close') : t('Cancel')}
                  </Button>
                  {phase !== 'done' && (
                    <Button
                      variant="primary"
                      disabled={!allowed || phase === 'running'}
                      onClick={run}
                      className="flex items-center gap-2"
                    >
                      {phase === 'running' && <LuRefreshCw className="animate-spin" />}
                      {phase === 'running' ? t('Running…') : `${t('Run on')} ${host}`}
                    </Button>
                  )}
                  {phase === 'done' && allowed && (
                    <Button variant="primary" onClick={run}>
                      {t('Run again')}
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
    </>
  )
}

function Output({ result }: { result: RunResult }): React.ReactElement {
  const ok = result.code === 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 ${ok ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}
        >
          {t('exit')} {result.code}
        </span>
      </div>
      {result.warning && (
        <p className="flex items-start gap-1 text-xs text-amber-500">
          <LuAlertTriangle className="mt-0.5 shrink-0" />
          <span>{result.warning}</span>
        </p>
      )}
      {result.stdout && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 text-xs">
          {result.stdout}
        </pre>
      )}
      {result.stderr && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-red-500/10 p-2 text-xs text-red-400">
          {result.stderr}
        </pre>
      )}
      {!result.stdout && !result.stderr && (
        <p className="text-xs opacity-60">{t('(no output)')}</p>
      )}
    </div>
  )
}
