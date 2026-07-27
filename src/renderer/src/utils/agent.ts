import { getOllama } from '@renderer/utils/ollama'
import { parseHarmony } from '@renderer/utils/utils'
import { isMcpToolName, type McpServer } from '../../../shared/mcp'
import type {
  NotificationEvent,
  NotificationPayload,
  NotificationPrefs
} from '../../../shared/notifications'

export type AgentMode = 'manual' | 'acceptEdits' | 'plan' | 'auto'

export interface AgentApproval {
  tool: string
  args: Record<string, unknown>
}

// Fire-and-forget native notification (main applies the pure shouldNotify policy).
function notify(
  event: NotificationEvent,
  payload: NotificationPayload,
  prefs?: NotificationPrefs
): void {
  if (!prefs) return
  try {
    window.api?.notify?.(event, payload, prefs)
  } catch {
    /* notifications are best-effort */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMessage = { role: string; content: string; tool_calls?: any[] }

const MAX_ITERATIONS = 25

// Module-level resolver so the approval modal (which lives elsewhere in the tree) can answer the loop.
let approvalResolver: ((ok: boolean) => void) | null = null

export function makeApprovalRequester(
  setApproval: (req: AgentApproval | null) => void,
  notificationPrefs?: NotificationPrefs
): (req: AgentApproval) => Promise<boolean> {
  return (req) =>
    new Promise<boolean>((resolve) => {
      approvalResolver = resolve
      // Ping the OS when an action is waiting on the user (respects their prefs).
      notify(
        'approval-needed',
        {
          tool: req.tool,
          command: String(req.args.command ?? ''),
          path: String(req.args.path ?? '')
        },
        notificationPrefs
      )
      setApproval(req)
    })
}

export function resolveAgentApproval(
  setApproval: (req: AgentApproval | null) => void,
  approved: boolean
): void {
  setApproval(null)
  approvalResolver?.(approved)
  approvalResolver = null
}

function toolCallBlock(name: string, args: Record<string, unknown>): string {
  if (name === 'run_command') return `\n\n**\`$ ${String(args.command ?? '')}\`**\n`
  if (name === 'write_file') return `\n\n**✎ write** \`${String(args.path ?? '')}\`\n`
  const detail = args.path ?? args.query ?? ''
  return `\n\n**🔧 ${name}** \`${String(detail)}\`\n`
}

function resultBlock(result: string): string {
  const trimmed = result.length > 1200 ? result.slice(0, 1200) + '\n…' : result
  return `\n\`\`\`\n${trimmed}\n\`\`\`\n`
}

/**
 * Runs the coding-agent tool loop: the model calls tools, we execute them in the working folder
 * (asking for approval on mutating ones), feed results back, and repeat until it produces a final
 * answer. Progress is streamed as a markdown transcript.
 * */
export async function runAgentLoop(opts: {
  model: string
  root: string
  mode: AgentMode
  messages: { role: string; content: string }[]
  tools: object[]
  mutating: Set<string>
  requestApproval: (req: AgentApproval) => Promise<boolean>
  onProgress: (transcript: string) => void
  shouldStop: () => boolean
  /** Optional: fired after each tool runs, for the analytics timeline. */
  onToolCall?: (call: { tool: string; durationMs: number }) => void
  /** Enabled MCP servers whose tools were merged into `tools`; MCP calls are routed to them. */
  mcpServers?: McpServer[]
  notificationPrefs?: NotificationPrefs
}): Promise<string> {
  const {
    model,
    root,
    mode,
    mutating,
    requestApproval,
    onProgress,
    shouldStop,
    onToolCall,
    notificationPrefs
  } = opts
  const mcpServers = opts.mcpServers ?? []

  // In plan mode the model must not modify anything, so we don't even offer the mutating tools.
  const tools =
    mode === 'plan'
      ? opts.tools.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tooldef) => !mutating.has((tooldef as any).function?.name)
        )
      : opts.tools

  const planNote =
    mode === 'plan'
      ? '\nYou are in PLAN MODE: you may read, list, and search, but you MUST NOT modify files or run commands. Produce a clear, step-by-step plan of the changes you would make. Do not make any changes.'
      : ''

  const system = {
    role: 'system',
    content: `You are a coding agent working inside the folder: ${root}
Use the provided tools to inspect${mode === 'plan' ? '' : ', modify,'} the project${mode === 'plan' ? '' : ' and run commands'}. Paths are relative to that folder.
Work step by step: read/list/search to understand before ${mode === 'plan' ? 'planning' : 'changing anything'}. When the task is complete, stop calling tools and give a short summary.${planNote}`
  }

  const working: AnyMessage[] = [system, ...opts.messages]
  let transcript = ''

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (shouldStop()) {
      transcript += '\n\n_Stopped._'
      break
    }

    const res = await getOllama().chat({
      model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: working as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      stream: false
    })
    const msg = res.message as AnyMessage

    const cleaned = parseHarmony(msg.content ?? '').content
    if (cleaned) {
      transcript += (transcript ? '\n\n' : '') + cleaned
      onProgress(transcript)
    }

    const toolCalls = msg.tool_calls ?? []
    if (toolCalls.length === 0) break // no more tools -> final answer produced

    working.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls })

    for (const call of toolCalls) {
      const name: string = call.function?.name
      const args: Record<string, unknown> = call.function?.arguments ?? {}
      transcript += toolCallBlock(name, args)
      onProgress(transcript)
      const toolStart = Date.now()

      const run = async (): Promise<string> => {
        try {
          // MCP tools (mcp__<server>__<tool>) run on their configured server; the rest are the
          // builtin file/command tools that run in the working folder.
          if (isMcpToolName(name)) return await window.api.mcpCallTool(mcpServers, name, args)
          return await window.api.runAgentTool(root, name, args)
        } catch (error) {
          return `Error: ${String(error)}`
        }
      }

      let result: string
      if (!mutating.has(name)) {
        // read-only tools always run
        result = await run()
      } else if (mode === 'plan') {
        // Should not happen (tools filtered), but guard in case the model improvises.
        result = 'Plan mode: modifications are disabled. Describe the change in your plan instead.'
      } else {
        // Safe by default: only auto-run when the mode explicitly allows it, otherwise ask.
        // auto -> everything; acceptEdits -> auto-write files but still confirm commands.
        const autoRun = mode === 'auto' || (mode === 'acceptEdits' && name === 'write_file')
        if (autoRun) {
          result = await run()
        } else {
          const approved = await requestApproval({ tool: name, args })
          result = approved
            ? await run()
            : 'The user rejected this action. Do not retry it; consider an alternative or stop.'
        }
      }

      onToolCall?.({ tool: name, durationMs: Date.now() - toolStart })
      transcript += resultBlock(result)
      onProgress(transcript)
      working.push({ role: 'tool', content: result })
    }
  }

  // Long-running run finished — nudge the user (main only shows it when the
  // window is unfocused). Summary is the first non-empty line of the transcript.
  const summary = transcript
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  notify('agent-complete', { summary }, notificationPrefs)

  return transcript || '_(no output)_'
}
