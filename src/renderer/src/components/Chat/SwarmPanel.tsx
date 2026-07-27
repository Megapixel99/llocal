import { ComponentProps, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { LuNetwork, LuPlay, LuSquare, LuSparkles, LuPlus, LuTrash2 } from 'react-icons/lu'
import {
  agentApprovalAtom,
  agentModeAtom,
  modelListAtom,
  prefModelAtom,
  workingFolderAtom
} from '@renderer/store/mocks'
import { cn, t } from '@renderer/utils/utils'
import { Button } from '@renderer/ui/Button'
import { Progress } from '@renderer/ui/Progress'
import { makeApprovalRequester } from '@renderer/utils/agent'
import {
  runSwarm,
  decomposePrompt,
  normalizeSubtasks
} from '@renderer/utils/swarm-runner'
import { useStructureOutputs } from '@renderer/hooks/useStructuredOutputs'
import { aggregateResults, type Subtask, type SubtaskStatus } from '../../../../shared/swarm'

const STATUS_STYLE: Record<SubtaskStatus, string> = {
  pending: 'text-foreground/50',
  running: 'text-blue-400',
  done: 'text-emerald-400',
  failed: 'text-red-400'
}
const STATUS_ICON: Record<SubtaskStatus, string> = {
  pending: '•',
  running: '…',
  done: '✓',
  failed: '✗'
}

const fieldClass =
  'p-2 rounded-lg bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 outline-none text-sm w-full'

/** Empty subtask template for manual entry. */
function blankSubtask(i: number): Subtask {
  return { id: `task-${i}`, title: '', prompt: '', dependsOn: [], files: [], status: 'pending' }
}

/**
 * "Swarm" panel for the Code tab: decompose a task into subtasks that run concurrently through the
 * existing coding-agent loop, with dependency scheduling and pessimistic file locking. All the
 * scheduling logic lives in src/shared/swarm.ts (pure, tested); this component is just the UI +
 * wiring. Mutating actions from each subtask still flow through the shared AgentApproval gate.
 */
export const SwarmPanel = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const folder = useAtomValue(workingFolderAtom)
  const model = useAtomValue(prefModelAtom)
  const modelList = useAtomValue(modelListAtom)
  const mode = useAtomValue(agentModeAtom)
  const setApproval = useSetAtom(agentApprovalAtom)
  const { getStructuredResponse } = useStructureOutputs()

  const [prompt, setPrompt] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [maxConcurrency, setMaxConcurrency] = useState(2)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const stopRef = useRef(false)

  const summary = subtasks.length ? aggregateResults(subtasks) : null
  const doneCount = subtasks.filter((s) => s.status === 'done' || s.status === 'failed').length
  const progress = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0

  const handleDecompose = async (): Promise<void> => {
    if (!prompt.trim()) return
    setBusy(true)
    const id = toast.loading(t('Decomposing into subtasks'))
    try {
      const built = await decomposePrompt(prompt, getStructuredResponse)
      setSubtasks(built)
      toast.success(`${built.length} ${t('subtasks')}`, { id })
    } catch (error) {
      toast.error(`${t('Could not decompose')}: ${String(error)}`, { id })
    } finally {
      setBusy(false)
    }
  }

  const handleRun = async (): Promise<void> => {
    if (!folder) {
      toast.warning(t('Choose a working folder to use the agent'))
      return
    }
    if (!model) {
      toast.warning(t('Select a model first'))
      return
    }
    if (!subtasks.length) return

    // Fresh run: reset every subtask to pending.
    const fresh = subtasks.map((s) => ({ ...s, status: 'pending' as const, result: undefined }))
    setSubtasks(fresh)
    stopRef.current = false
    setRunning(true)
    try {
      const { tools, mutating } = await window.api.getAgentTools()
      await runSwarm({
        model,
        root: folder,
        mode,
        subtasks: fresh,
        tools,
        mutating: new Set(mutating),
        maxConcurrency,
        requestApproval: makeApprovalRequester(setApproval),
        onUpdate: (next) => setSubtasks([...next]),
        shouldStop: () => stopRef.current
      })
    } catch (error) {
      toast.error(`${error}`)
    } finally {
      setRunning(false)
      setApproval(null)
    }
  }

  const handleStop = (): void => {
    stopRef.current = true
  }

  const addManual = (): void =>
    setSubtasks((prev) => [...prev, blankSubtask(prev.length + 1)])

  const patch = (i: number, field: keyof Subtask, value: string): void =>
    setSubtasks((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s
        if (field === 'dependsOn' || field === 'files') {
          return { ...s, [field]: value.split(',').map((v) => v.trim()).filter(Boolean) }
        }
        return { ...s, [field]: value }
      })
    )

  const remove = (i: number): void => setSubtasks((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-3 rounded-xl bg-foreground bg-opacity-5 dark:bg-background dark:bg-opacity-20 text-sm',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <LuNetwork className="text-blue-400" />
        <span className="font-medium">{t('Parallel tasks (swarm)')}</span>
        <span className="opacity-50 text-xs">
          {t('Run subtasks concurrently through the coding agent')}
        </span>
      </div>

      {/* Decompose a prompt into a graph (with manual fallback below). */}
      <div className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('Describe the overall task to split into parallel subtasks…')}
          rows={2}
          className={fieldClass}
          disabled={running}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            className="text-xs flex items-center gap-1"
            onClick={handleDecompose}
            disabled={busy || running || !prompt.trim()}
          >
            <LuSparkles /> {t('Decompose')}
          </Button>
          <Button
            variant="link"
            className="text-xs flex items-center gap-1"
            onClick={addManual}
            disabled={running}
          >
            <LuPlus /> {t('Add subtask')}
          </Button>

          <label className="flex items-center gap-1 text-xs opacity-70 ml-auto">
            {t('Max concurrency')}
            <select
              value={maxConcurrency}
              onChange={(e) => setMaxConcurrency(Number(e.target.value))}
              disabled={running}
              className="bg-transparent outline-none"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="text-black">
                  {n}
                </option>
              ))}
            </select>
          </label>

          {running ? (
            <Button
              variant="primary"
              className="text-xs flex items-center gap-1"
              onClick={handleStop}
            >
              <LuSquare /> {t('Stop')}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="text-xs flex items-center gap-1"
              onClick={handleRun}
              disabled={!subtasks.length}
            >
              <LuPlay /> {t('Run swarm')}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {subtasks.length > 0 && (
        <div className="flex items-center gap-2 text-xs opacity-70">
          <Progress value={progress} className="flex-1" />
          <span>
            {doneCount}/{subtasks.length}
          </span>
        </div>
      )}

      {/* Subtask cards */}
      {subtasks.length > 0 && (
        <div className="flex flex-col gap-2 max-h-72 overflow-auto">
          {subtasks.map((sub, i) => (
            <div
              key={sub.id}
              className="flex flex-col gap-1 p-2 rounded-lg bg-foreground bg-opacity-5 dark:bg-background dark:bg-opacity-20"
            >
              <div className="flex items-center gap-2">
                <span className={cn('font-mono', STATUS_STYLE[sub.status])}>
                  {STATUS_ICON[sub.status]}
                </span>
                {running ? (
                  <span className="font-medium truncate">{sub.title || sub.id}</span>
                ) : (
                  <input
                    value={sub.title}
                    onChange={(e) => patch(i, 'title', e.target.value)}
                    placeholder={t('title')}
                    className="bg-transparent outline-none font-medium flex-1"
                  />
                )}
                {sub.model && (
                  <span
                    className="max-w-[9rem] shrink-0 truncate rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] opacity-70 dark:bg-white/10"
                    title={sub.model}
                  >
                    {sub.model}
                  </span>
                )}
                <span className={cn('text-xs', STATUS_STYLE[sub.status])}>{t(sub.status)}</span>
                {!running && (
                  <button onClick={() => remove(i)} title={t('Remove')} className="opacity-40 hover:opacity-100">
                    <LuTrash2 size={14} />
                  </button>
                )}
              </div>

              {running ? (
                sub.result && (
                  <pre className="text-xs opacity-70 whitespace-pre-wrap max-h-24 overflow-auto">
                    {sub.result.slice(0, 400)}
                  </pre>
                )
              ) : (
                <div className="flex flex-col gap-1">
                  <textarea
                    value={sub.prompt}
                    onChange={(e) => patch(i, 'prompt', e.target.value)}
                    placeholder={t('subtask instruction')}
                    rows={2}
                    className={fieldClass}
                  />
                  <div className="flex gap-2">
                    <input
                      value={sub.dependsOn.join(', ')}
                      onChange={(e) => patch(i, 'dependsOn', e.target.value)}
                      placeholder={t('depends on (ids, comma-sep)')}
                      className={cn(fieldClass, 'text-xs')}
                    />
                    <input
                      value={sub.files.join(', ')}
                      onChange={(e) => patch(i, 'files', e.target.value)}
                      placeholder={t('files (comma-sep)')}
                      className={cn(fieldClass, 'text-xs')}
                    />
                  </div>
                  {/* Optional per-subtask model so each can run on the model that fits it best. */}
                  <select
                    value={sub.model ?? ''}
                    onChange={(e) => patch(i, 'model', e.target.value)}
                    className={cn(fieldClass, 'text-xs')}
                    title={t('Model for this subtask')}
                  >
                    <option value="" className="text-black">
                      {t('Default model')} {model ? `(${model})` : ''}
                    </option>
                    {modelList.map((m) => (
                      <option key={m.modelName} value={m.modelName} className="text-black">
                        {m.modelName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Aggregated summary */}
      {summary && !running && doneCount > 0 && (
        <div className="text-xs opacity-70 border-t border-foreground/10 pt-2">
          {(['done', 'failed', 'pending', 'running'] as SubtaskStatus[])
            .filter((s) => summary.counts[s] > 0)
            .map((s) => `${summary.counts[s]} ${t(s)}`)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}

// Re-exported for tests / callers that want to normalise raw graphs without importing the runner.
export { normalizeSubtasks }
