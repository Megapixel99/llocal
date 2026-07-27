import { getOllama } from '@renderer/utils/ollama'
import { parseHarmony } from '@renderer/utils/utils'
import { isMcpToolName, type McpServer } from '../../../shared/mcp'
import { runReasoning, runDeepResearch } from '@renderer/utils/agents'
import type { Effort } from '@renderer/store/mocks'
import {
  AGENT_RESEARCH_TOOLS,
  DEEP_RESEARCH_TOOL_NAME,
  REASON_TOOL_NAME,
  extractReasonProblem,
  extractResearchQuery,
  formatResearchResult,
  isResearchToolName
} from '@renderer/utils/agent-research-tools'
import {
  SUBAGENT_TOOL_NAME,
  allowedAgentTypes,
  canSpawnSubagent,
  effectiveChildPolicy,
  extractSubagentTask,
  extractSubagentTypeId,
  filterToolsForPolicy,
  formatSubagentResult,
  getAgentType,
  subagentTool,
  type ToolPolicy
} from '../../../shared/subagent'
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
  const detail = args.path ?? args.query ?? args.problem ?? args.task ?? ''
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
  /** DeepResearch breadth for the `deep_research` tool (defaults to 'medium'). */
  effort?: Effort
  /** Sub-agent nesting depth (top-level run is 0). Bounds recursion. */
  depth?: number
  /** This run's tool policy: 'full' (default) or 'readonly' for read-only sub-agents. */
  policy?: ToolPolicy
  /** Extra role instructions (a sub-agent type's system prompt) prepended to the system message. */
  rolePrompt?: string
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
  const effort: Effort = opts.effort ?? 'medium'
  const depth = opts.depth ?? 0
  const policy: ToolPolicy = opts.policy ?? 'full'

  // Offer the DeepResearch / Reasoning capabilities as tools too. They are
  // read-only (no file writes, no commands), so they stay available even in plan
  // mode and never require approval. `spawn_subagent` (also read-only itself —
  // the sub-agent's own actions are gated) is offered until the depth cap, and a
  // read-only agent may only delegate to read-only sub-agents.
  const canDelegate = canSpawnSubagent(depth)
  const baseTools = [
    ...opts.tools,
    ...(AGENT_RESEARCH_TOOLS as unknown as object[]),
    ...(canDelegate ? [subagentTool(allowedAgentTypes(policy))] : [])
  ]

  // In plan mode the model must not modify anything, so we don't even offer the mutating tools.
  const tools =
    mode === 'plan'
      ? baseTools.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tooldef) => !mutating.has((tooldef as any).function?.name)
        )
      : baseTools

  const planNote =
    mode === 'plan'
      ? '\nYou are in PLAN MODE: you may read, list, and search, but you MUST NOT modify files or run commands. Produce a clear, step-by-step plan of the changes you would make. Do not make any changes.'
      : ''

  const roleNote = opts.rolePrompt ? `\n${opts.rolePrompt}` : ''
  const delegateNote = canDelegate
    ? `\nFor a large, self-contained piece of work, call \`${SUBAGENT_TOOL_NAME}\` to delegate it to a focused sub-agent (explorer/coder/reviewer) and get back just its result — handy for isolating research or running independent tasks.`
    : ''

  const system = {
    role: 'system',
    content: `You are a coding agent working inside the folder: ${root}
Use the provided tools to inspect${mode === 'plan' ? '' : ', modify,'} the project${mode === 'plan' ? '' : ' and run commands'}. Paths are relative to that folder.
Work step by step: read/list/search to understand before ${mode === 'plan' ? 'planning' : 'changing anything'}.
For a hard sub-problem, call \`${REASON_TOOL_NAME}\` to think it through step by step before acting. For anything outside this codebase — library or API docs, package versions, an unfamiliar error, current facts — call \`${DEEP_RESEARCH_TOOL_NAME}\` to look it up on the web (it returns a cited summary).${delegateNote}
When the task is complete, stop calling tools and give a short summary.${planNote}${roleNote}`
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
          // Delegate a self-contained subtask to a fresh, scoped sub-agent (a nested
          // runAgentLoop). Its own mutating actions still go through approval; a
          // read-only parent can only spawn read-only children; recursion is depth-bounded.
          if (name === SUBAGENT_TOOL_NAME) {
            if (!canDelegate) return 'Error: maximum sub-agent depth reached — do this work yourself.'
            const task = extractSubagentTask(args)
            if (!task) return 'Error: `spawn_subagent` needs a non-empty "task".'
            const type = getAgentType(extractSubagentTypeId(args))
            const childPolicy = effectiveChildPolicy(policy, type.toolPolicy)
            const childTranscript = await runAgentLoop({
              model,
              root,
              mode,
              messages: [{ role: 'user', content: task }],
              tools: filterToolsForPolicy(opts.tools, mutating, childPolicy),
              mutating,
              requestApproval,
              onProgress: (partial) => onProgress(transcript + '\n' + partial),
              shouldStop,
              onToolCall,
              mcpServers,
              notificationPrefs,
              effort,
              depth: depth + 1,
              policy: childPolicy,
              rolePrompt: type.systemPrompt
            })
            return formatSubagentResult(type.name, task, childTranscript)
          }
          // Reasoning / DeepResearch run here in the renderer (they drive Ollama and web
          // search directly), streaming their progress under the tool block.
          if (isResearchToolName(name)) {
            const live = (partial: string): void => onProgress(transcript + '\n' + partial)
            if (name === REASON_TOOL_NAME) {
              const problem = extractReasonProblem(args)
              if (!problem) return 'Error: `reason` needs a non-empty "problem".'
              return await runReasoning({
                model,
                messages: [{ role: 'user', content: problem }],
                onProgress: live,
                shouldStop
              })
            }
            // deep_research
            const query = extractResearchQuery(args)
            if (!query) return 'Error: `deep_research` needs a non-empty "query".'
            const { content, sources } = await runDeepResearch({
              model,
              prompt: query,
              effort,
              onProgress: live,
              shouldStop
            })
            return formatResearchResult(content, sources)
          }
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
  // window is unfocused). Only the top-level run notifies; nested sub-agents
  // finishing shouldn't each ping the OS. Summary is the first non-empty line.
  if (depth === 0) {
    const summary = transcript
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    notify('agent-complete', { summary }, notificationPrefs)
  }

  return transcript || '_(no output)_'
}
