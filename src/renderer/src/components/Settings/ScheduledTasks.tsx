import React, { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { LuPlay, LuTrash2, LuCheckCircle2, LuCircle } from 'react-icons/lu'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'
import { agentModeAtom } from '@renderer/store/mocks'
import { isUnattendedAllowed, isValidCron, nextRun, type Task, type TaskKind } from '../../../../shared/schedule'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

function emptyDraft(): Task {
  return {
    id: '',
    name: '',
    kind: 'prompt',
    payload: '',
    cron: '0 9 * * *',
    unattended: false,
    enabled: true
  }
}

/** Human-readable "next run" for a cron expression, or an error string. */
function nextRunLabel(cron: string): string {
  if (!isValidCron(cron)) return t('Invalid cron expression')
  try {
    return nextRun(cron, new Date()).toLocaleString()
  } catch {
    return t('No upcoming run')
  }
}

export const ScheduledTasks = (): React.ReactElement => {
  const agentMode = useAtomValue(agentModeAtom)
  const unattendedAllowed = isUnattendedAllowed(agentMode)
  const [tasks, setTasks] = useState<Task[]>([])
  const [draft, setDraft] = useState<Task>(emptyDraft())

  useEffect(() => {
    window.api
      .listSchedules()
      .then(setTasks)
      .catch(() => {
        /* scheduler optional */
      })
  }, [])

  const preview = useMemo(() => nextRunLabel(draft.cron), [draft.cron])

  function update(patch: Partial<Task>): void {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  async function handleSave(): Promise<void> {
    if (!draft.name.trim()) return void toast.error(t('Give the task a name'))
    if (!draft.payload.trim()) return void toast.error(t('Add a prompt or command to run'))
    if (!isValidCron(draft.cron)) return void toast.error(t('Invalid cron expression'))
    // Guard the gate in the UI too, though main is authoritative.
    const unattended = draft.unattended && unattendedAllowed
    const task: Task = { ...draft, unattended, id: draft.id || crypto.randomUUID() }
    try {
      const updated = await window.api.saveSchedule(task)
      setTasks(updated)
      setDraft(emptyDraft())
      toast.success(t('Scheduled task saved'))
    } catch (e) {
      toast.error(`${t('Could not save task')}: ${e}`)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      setTasks(await window.api.deleteSchedule(id))
      toast.success(t('Task deleted'))
    } catch (e) {
      toast.error(`${t('Could not delete task')}: ${e}`)
    }
  }

  async function handleRunNow(task: Task): Promise<void> {
    const ok = await window.api.runScheduleNow(task.id)
    if (!ok) toast.error(t('Could not run task (unattended needs Auto agent mode)'))
  }

  async function handleToggleEnabled(task: Task): Promise<void> {
    const updated = await window.api.saveSchedule({ ...task, enabled: !task.enabled })
    setTasks(updated)
  }

  function handleEdit(task: Task): void {
    setDraft({ ...task })
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl w-full">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{draft.id ? t('Edit scheduled task') : t('New scheduled task')}</h2>

        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">{t('Name')}</span>
          <input
            className={fieldClass}
            value={draft.name}
            placeholder={t('Morning summary')}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">{t('Type')}</span>
            <select
              className={fieldClass}
              value={draft.kind}
              onChange={(e) => update({ kind: e.target.value as TaskKind })}
            >
              <option value="prompt">{t('Prompt')}</option>
              <option value="command">{t('Slash command')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">{t('Cron (min hour dom month dow)')}</span>
            <input
              className={fieldClass}
              value={draft.cron}
              placeholder="0 9 * * 1-5"
              onChange={(e) => update({ cron: e.target.value })}
            />
          </label>
        </div>

        <p className="text-xs opacity-60">
          {t('Next run')}: <span className="opacity-100">{preview}</span>
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">
            {draft.kind === 'command' ? t('Command to run (e.g. /review)') : t('Prompt to run')}
          </span>
          <textarea
            className={`${fieldClass} min-h-[80px] resize-y`}
            value={draft.payload}
            placeholder={draft.kind === 'command' ? '/summarize the latest changes' : t('Summarize my day')}
            onChange={(e) => update({ payload: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span className="text-sm">{t('Enabled')}</span>
        </label>

        <label
          className={`flex items-center gap-2 select-none ${unattendedAllowed ? 'cursor-pointer' : 'opacity-50'}`}
        >
          <input
            type="checkbox"
            disabled={!unattendedAllowed}
            checked={draft.unattended && unattendedAllowed}
            onChange={(e) => update({ unattended: e.target.checked })}
          />
          <span className="text-sm">{t('Run unattended (autonomous)')}</span>
        </label>
        {!unattendedAllowed && (
          <p className="text-xs opacity-60 -mt-2">
            {t('Unattended runs are only allowed when the agent mode is Auto. Switch to Auto to enable this.')}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="primary" className="w-fit" onClick={handleSave}>
            {draft.id ? t('Update task') : t('Add task')}
          </Button>
          {draft.id && (
            <Button variant="secondary" className="w-fit" onClick={() => setDraft(emptyDraft())}>
              {t('Cancel')}
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Scheduled tasks')}</h2>
        {tasks.length === 0 && <p className="text-xs opacity-60">{t('No tasks yet.')}</p>}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background bg-opacity-20 backdrop-blur-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                title={task.enabled ? t('Disable') : t('Enable')}
                onClick={() => handleToggleEnabled(task)}
                className="text-xl opacity-70 hover:opacity-100 transition-all shrink-0"
              >
                {task.enabled ? <LuCheckCircle2 /> : <LuCircle />}
              </button>
              <div className="min-w-0">
                <div className="text-sm truncate">
                  {task.name}
                  {task.unattended && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-400">
                      {t('unattended')}
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-60 truncate">
                  {task.kind} · {task.cron} · {nextRunLabel(task.cron)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                title={t('Run now')}
                onClick={() => handleRunNow(task)}
                className="text-lg opacity-70 hover:opacity-100 transition-all"
              >
                <LuPlay />
              </button>
              <button
                title={t('Edit')}
                onClick={() => handleEdit(task)}
                className="text-xs opacity-70 hover:opacity-100 transition-all underline"
              >
                {t('Edit')}
              </button>
              <button
                title={t('Delete')}
                onClick={() => handleDelete(task.id)}
                className="text-lg opacity-70 hover:opacity-100 transition-all"
              >
                <LuTrash2 />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
