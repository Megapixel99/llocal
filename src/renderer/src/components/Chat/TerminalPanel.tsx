import { workingFolderAtom } from '@renderer/store/mocks'
import { useAtomValue } from 'jotai'
import { ComponentProps, useEffect, useReducer, useRef, useState } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { Button } from '@renderer/ui/Button'
import { LuTerminal, LuX } from 'react-icons/lu'
import { initialTerminalState, stripAnsi, terminalReducer } from '../../../../shared/terminal'

const fieldClass =
  'p-2 rounded-lg bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 outline-none text-sm w-full font-mono'

/**
 * Interactive, streaming console for the Code tab — the visible sibling of the
 * agent's non-interactive run_command. Spawns a command in the working folder,
 * renders stdout/stderr as they stream in, forwards typed lines to the child's
 * stdin, and offers a Kill button. All line assembly / ANSI stripping / session
 * state lives in the pure src/shared/terminal core (reducer + stripAnsi), so this
 * component is a thin shell around it.
 */
export const TerminalPanel = ({
  className,
  onClose,
  ...props
}: ComponentProps<'div'> & { onClose?: () => void }): React.ReactElement => {
  const folder = useAtomValue(workingFolderAtom)
  const [state, dispatch] = useReducer(terminalReducer, initialTerminalState)
  const [command, setCommand] = useState('')
  const [input, setInput] = useState('')
  const sessionRef = useRef<string | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  // Subscribe once to the streamed data / exit events; ignore other sessions.
  useEffect(() => {
    const offData = window.api.onTerminalData(({ sessionId, chunk }) => {
      if (sessionId !== sessionRef.current) return
      dispatch({ type: 'data', chunk: stripAnsi(chunk) })
    })
    const offExit = window.api.onTerminalExit(({ sessionId, code }) => {
      if (sessionId !== sessionRef.current) return
      dispatch({ type: 'exit', code })
    })
    return () => {
      offData()
      offExit()
    }
  }, [])

  // Auto-scroll to the bottom as new output arrives.
  useEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.lines])

  const running = state.status === 'running'

  const run = async (): Promise<void> => {
    if (!command.trim() || running) return
    dispatch({ type: 'start' })
    try {
      sessionRef.current = await window.api.startTerminal({
        command,
        cwd: folder || undefined
      })
    } catch (error) {
      dispatch({ type: 'data', chunk: `\n[error] ${String(error)}\n` })
      dispatch({ type: 'exit', code: null })
    }
  }

  const sendInput = async (): Promise<void> => {
    if (!running || !sessionRef.current) return
    const line = input + '\n'
    await window.api.sendTerminalInput(sessionRef.current, line)
    dispatch({ type: 'data', chunk: line }) // local echo (piped stdin isn't echoed by the shell)
    setInput('')
  }

  const kill = async (): Promise<void> => {
    if (sessionRef.current) await window.api.killTerminal(sessionRef.current)
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl p-3 bg-foreground bg-opacity-5 dark:bg-background dark:bg-opacity-20',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 text-xs opacity-70">
        <LuTerminal />
        <span className="font-medium">{t('Terminal')}</span>
        {running && <span className="size-2 rounded-full bg-emerald-500" title={t('Running')} />}
        {state.status === 'exited' && (
          <span className="opacity-70">
            {t('Exited')} ({state.exitCode ?? t('killed')})
          </span>
        )}
        <span className="ml-auto" />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={t('Close terminal')}
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            <LuX />
          </button>
        )}
      </div>

      {/* Command to run */}
      <div className="flex items-center gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              run()
            }
          }}
          placeholder={folder ? t('Command to run') : t('Choose a working folder first')}
          className={fieldClass}
        />
        <Button variant="primary" className="text-xs whitespace-nowrap" onClick={run} disabled={!command.trim() || running}>
          {t('Run')}
        </Button>
        <Button
          variant="secondary"
          className="text-xs whitespace-nowrap"
          onClick={kill}
          disabled={!running}
        >
          {t('Kill')}
        </Button>
      </div>

      {/* Streamed output */}
      <pre
        ref={outputRef}
        className="h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black bg-opacity-80 p-3 text-xs text-emerald-100 font-mono"
      >
        {state.lines.join('\n') || t('Output will appear here.')}
      </pre>

      {/* stdin */}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              sendInput()
            }
          }}
          placeholder={running ? t('Type input, press Enter to send') : t('Start a command to send input')}
          disabled={!running}
          className={cn(fieldClass, !running && 'opacity-50')}
        />
      </div>
    </div>
  )
}
