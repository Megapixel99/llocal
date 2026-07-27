import React, {
  ChangeEvent, ComponentProps,
  useEffect,
  useRef,
  useState,
  // useCallback
} from 'react'
import { twMerge } from 'tailwind-merge'
import { PiChartBarBold, PiPaperPlaneRightFill, PiStopCircleBold } from 'react-icons/pi'
import { LuNetwork, LuTerminal } from 'react-icons/lu'
import { SubmitHandler, useForm } from 'react-hook-form'
import { usePrompt } from '@renderer/hooks/usePrompt'
import { getOllama } from '@renderer/utils/ollama'
import { TextArea } from '@renderer/ui/TextArea'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@renderer/ui/Button'
import { MoreButton } from './MoreButton'
import { ContextCard } from './ContextCard'
import { ContextInfo } from './ContextInfo'
import { AnalyticsPanel } from './Analytics/AnalyticsPanel'
import { Modal } from '@renderer/ui/Modal'
import { GitPanel } from './GitPanel'
import { TerminalPanel } from './TerminalPanel'
import { WorkspaceFolder } from './WorkspaceFolder'
import { AgentModeSelector } from './AgentModeSelector'
import { SwarmPanel } from './SwarmPanel'
import { EffortSelector } from './EffortSelector'
import { VerbositySelector } from './VerbositySelector'
import { AgentApproval } from './AgentApproval'
import { Mascot } from './Mascot'
import { AutoComplete } from './AutoComplete'
import { CommandPalette } from './CommandPalette'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { activeTabAtom, agentModeAtom, commandListAtom, fileContextAtom, fileDropAtom, knowledgeBaseAtom, notificationPrefsAtom, stopGeneratingAtom, suggestionsAtom } from '@renderer/store/mocks'
import ToolTip from '@renderer/ui/ToolTip'
import { t } from '@renderer/utils/utils'
import { Command, filterCommands, maybeExpandCommand } from '@renderer/utils/commands'
import { toast } from 'sonner'
import { firedTaskAction, type Task } from '../../../../shared/schedule'

// Ensuring there is atleast one valid character, and no whitespaces this helps eradicate the white space as a message edge case
const FormFieldsSchema = z.object({
  prompt: z.string().trim().min(1)
})

// defining the form type as usual
type FormFieldsType = {
  prompt?: string
}

export const InputForm = ({ className, ...props }: ComponentProps<'form'>): React.ReactElement => {
  const { register, handleSubmit, reset, setValue, setFocus } = useForm<FormFieldsType>({
    resolver: zodResolver(FormFieldsSchema)
  })
  const [isLoading, promptReq] = usePrompt()
  const promptReqRef = useRef(promptReq)
  promptReqRef.current = promptReq // always call the latest promptReq (fresh chat closure) when draining
  const [queue, setQueue] = useState<string[]>([])
  const drainingRef = useRef(false)
  const [autoCompleteList, setAutoCompleteList] = useAtom(knowledgeBaseAtom);
  const setStopGenerating = useSetAtom(stopGeneratingAtom)
  const setSuggestions = useSetAtom(suggestionsAtom)
  const context = useAtomValue(fileContextAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const [isAutoComplete, setIsAutoComplete] = useState(false)
  const [commandList, setCommandList] = useAtom(commandListAtom)
  const [commandMatches, setCommandMatches] = useState<Command[]>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const [showSwarm, setShowSwarm] = useState(false)
  const fileDrop = useAtomValue(fileDropAtom)
  const agentMode = useAtomValue(agentModeAtom)
  const notificationPrefs = useAtomValue(notificationPrefsAtom)

  // Send queued messages one at a time as each generation finishes. drainingRef guards against the
  // brief window before isLoading flips back to true after we kick off the next prompt.
  useEffect(() => {
    if (isLoading) {
      drainingRef.current = false
      return
    }
    if (queue.length === 0 || drainingRef.current) return
    drainingRef.current = true
    const [next, ...rest] = queue
    setQueue(rest)
    promptReqRef.current(next)
  }, [isLoading, queue])

  // Load the available slash commands once (from ~/.claude/commands, the LLocal
  // commands folder, and the bundled examples) so the palette can suggest them.
  useEffect(() => {
    if (commandList.length > 0) return
    window.api
      .listCommands()
      .then(setCommandList)
      .catch(() => {
        /* commands are optional — ignore load failures */
      })
  }, [])

  // Keep the main-process scheduler informed of the live agent mode so its
  // "unattended only in Auto" safety gate re-checks against the current value.
  useEffect(() => {
    window.api.setScheduleAgentMode(agentMode).catch(() => {
      /* scheduler is optional — ignore if unavailable */
    })
  }, [agentMode])

  // React to a scheduled task the main process decided is due. Unattended tasks
  // only reach here in Auto mode (gated in main); we re-check defensively before
  // auto-running. Attended tasks just prefill the composer for the user.
  useEffect(() => {
    const expand = (task: Task): string => {
      if (task.kind !== 'command') return task.payload
      const invocation = task.payload.trim().startsWith('/') ? task.payload.trim() : `/${task.payload.trim()}`
      return maybeExpandCommand(invocation, commandList)
    }

    const offFire = window.api.onScheduleFire(async (task) => {
      const prompt = expand(task)
      switch (firedTaskAction(task, agentMode)) {
        case 'blocked':
          toast.error(t('Unattended task requires Auto agent mode'))
          break
        case 'run':
          toast.info(`${t('Running scheduled task')}: ${task.name}`)
          // Await the autonomous run, then surface a native "done" notification.
          // The unattended run is the only path that actually completes here.
          await promptReq(prompt)
          window.api?.notify?.('scheduled-task-done', { taskName: task.name }, notificationPrefs)
          break
        case 'prefill':
          setValue('prompt', prompt)
          setFocus('prompt')
          toast.info(`${t('Scheduled task ready to send')}: ${task.name}`)
          break
      }
    })

    const offNotice = window.api.onScheduleNotice(({ level, message }) => {
      const fn = level === 'warning' ? toast.warning : toast[level] ?? toast.info
      fn(message)
    })

    return () => {
      offFire()
      offNotice()
    }
  }, [agentMode, commandList, notificationPrefs])

  function handleClick(): void {
    setStopGenerating(true) // ask the in-flight generation to stop
    getOllama().abort() // and abort the request immediately so Stop is responsive
  }

  // Insert the chosen command's invocation; the user then types any arguments
  // after it, which are substituted into the template when the prompt is sent.
  function handleSelectCommand(command: Command): void {
    setValue('prompt', `/${command.name} `)
    setCommandMatches([])
    setFocus('prompt')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault() // don't insert the default newline when submitting
      handleSubmit(onSubmit)()
    }
  }

  const onSubmit: SubmitHandler<FormFieldsType> = async (data) => {
    const value = data.prompt || ''
    reset()
    setAutoCompleteList([])
    setCommandMatches([])
    setSuggestions(pre => ({ ...pre, prompts: [] }))
    // Expand a leading `/command …` into its template before sending; plain
    // prompts (and unknown slashes) pass through untouched.
    const finalPrompt = maybeExpandCommand(value, commandList)
    // If a generation is already running, queue this one; the drain effect sends it when free.
    if (isLoading) {
      setQueue((q) => [...q, finalPrompt])
      return
    }
    await promptReq(finalPrompt)
  }

  async function handleChange(e: ChangeEvent<HTMLTextAreaElement>): Promise<void> {
    const input = e.target.value;

    // While typing the command token (a leading `/word` with no space yet),
    // suggest matching commands. This takes precedence over file mentions.
    const commandTyping = input.match(/^\/([^\s]*)$/)
    const matches = commandTyping ? filterCommands(commandList, commandTyping[1]) : []
    setCommandMatches(matches)

    // File-mention autocomplete (knowledge base) — kept as a fallback for when
    // the slash doesn't match any command.
    if (input.trim().startsWith("/") && matches.length === 0) {
      const list = await window.api.getVectorDbList();
      const typed = input.replace('/', ''); // this is to get whatever the user has typed after the /
      setAutoCompleteList(list.filter((val) => val.fileName.includes(typed)))
      setIsAutoComplete(true)
    } else {
      setAutoCompleteList([]) // set it empty when it does not start with /
      setIsAutoComplete(false)
    }
  }
  // TODO: Fix the sources to have new lines working (\n)
  // const handleContext = useCallback(() => {
  //   let formattedText = ""
  //   for (let i = 0; i < context.length; i++) {
  //     formattedText += context[i].fileName + ",\n"
  //   }
  //   return formattedText
  // }, [context])
  //
  return (
    <div className='relative w-full md:max-w-[48rem] flex flex-col'>
      {/* Little composer companion, perched on the top edge of the input box. */}
      {/* anchor to the bottom (just above the textarea) so the height of the info rows above doesn't push Lo up */}
      <Mascot className='absolute right-3 bottom-14 z-10' />
      {commandMatches.length > 0
        ? <CommandPalette className='absolute -bottom-3 transform -translate-y-1/2' commands={commandMatches} onSelectCommand={handleSelectCommand} />
        : (isAutoComplete && autoCompleteList.length > 0) && <AutoComplete className='absolute -bottom-3 transform -translate-y-1/2' list={autoCompleteList} reset={reset} />}
      <AgentApproval />
      {activeTab === 'agent' && showSwarm && <SwarmPanel className='mb-2' />}
      <div className='flex items-center justify-between gap-3 mb-1 px-2 flex-wrap'>
        <div className='flex items-center gap-3 flex-wrap'>
          {activeTab === 'agent' && <AgentModeSelector />}
          {activeTab === 'agent' && (
            <button
              type='button'
              onClick={() => setShowSwarm((v) => !v)}
              className={twMerge(
                'flex items-center gap-1 text-xs transition-opacity',
                showSwarm ? 'opacity-100 text-blue-400' : 'opacity-60 hover:opacity-100'
              )}
              title={t('Run multiple subtasks in parallel')}
            >
              <LuNetwork /> {t('Swarm')}
            </button>
          )}
          {activeTab === 'chat' && <EffortSelector />}
          {activeTab === 'chat' && <VerbositySelector />}
          <WorkspaceFolder />
          <GitPanel />
          {activeTab === 'agent' && (
            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              title={t('Toggle terminal')}
              className={twMerge(
                'flex items-center gap-1 text-xs transition-opacity',
                showTerminal ? 'opacity-100' : 'opacity-60 hover:opacity-100'
              )}
            >
              <LuTerminal /> {t('Terminal')}
            </button>
          )}
        </div>
        {/* pr-14 reserves the bottom-right corner for the mascot (Lo) so it doesn't cover the meter */}
        <div className='flex items-center gap-2 pr-14'>
          {queue.length > 0 && (
            <button
              type="button"
              onClick={() => setQueue([])}
              title={t('Clear queued messages')}
              className='text-xs opacity-60 hover:opacity-100 transition-opacity'
            >
              {queue.length} {t('queued')} ✕
            </button>
          )}
          <ContextInfo />
          <Modal.Root>
            <ToolTip tooltip={t('Session analytics')}>
              <Modal.Trigger className='cursor-pointer text-base opacity-50 hover:opacity-100'>
                <PiChartBarBold />
              </Modal.Trigger>
            </ToolTip>
            <Modal.Overlay />
            <Modal.Content className='max-h-[80vh] overflow-y-auto'>
              <AnalyticsPanel />
            </Modal.Content>
          </Modal.Root>
        </div>
      </div>
      {activeTab === 'agent' && showTerminal && (
        <TerminalPanel className="mb-2" onClose={() => setShowTerminal(false)} />
      )}
      <ToolTip className='self-end w-fit h-full m-1 mr-5' tooltip={context.length > 1 ? `${context.length} ${t("files")}` : `${context.length} ${t("file")}`}>
        <ContextCard className='' />
      </ToolTip>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={twMerge(`relative w-full h-12`, className)}
        {...props}
      >
        <TextArea
          name="prompt"
          register={register}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          variant={"chat"}
          className={`h-full w-full pl-10 pr-8 ${fileDrop && "outline-dotted outline-2 opacity-50 hover:opacity-100"}`}
          placeholder={isLoading ? t("Queue a message…") : t("Enter your prompt")}
        />
        <MoreButton className="text-2xl absolute left-2 top-1/2 transform -translate-y-1/2" />

        {isLoading ? <Button
          type="reset"
          variant={'icon'}
          onClick={handleClick}
          className="text-2xl absolute right-2 top-1/2 transform -translate-y-1/2"
        >
          <PiStopCircleBold />
        </Button>
          :
          <Button
            type="submit"
            variant={'icon'}
            disabled={isLoading}
            className="text-2xl absolute right-2 top-1/2 transform -translate-y-1/2"
          >
            <PiPaperPlaneRightFill />
          </Button>}
      </form>
    </div>
  )
}
