/**
 * Sub-agents for the coding agent.
 *
 * The Swarm feature lets a *user* fan a task out into parallel subtasks. This is
 * the complementary primitive on the *model* side: a `spawn_subagent` tool the
 * coding agent can call mid-run to delegate a self-contained piece of work to a
 * fresh agent with its own focused context, then get back just a concise result
 * — the way one would hand nine independent PRs to nine sub-agents.
 *
 * A sub-agent has a *type* that scopes what it can do:
 *   - explorer / reviewer — read-only (read, list, search, research); cannot
 *     modify files or run commands, and can only spawn read-only sub-agents;
 *   - coder — full access to complete a self-contained change.
 *
 * This module is pure — the agent-type registry, the tool schema, argument
 * extraction, the policy-based tool filter, recursion-depth guard, and result
 * formatting — so it can be unit-tested without Ollama/Electron. The actual
 * nested run happens in agent.ts (it recurses into runAgentLoop).
 */

/** How much a sub-agent is allowed to touch. */
export type ToolPolicy = 'readonly' | 'full'

export interface AgentType {
  id: string
  name: string
  description: string
  toolPolicy: ToolPolicy
  /** Role instructions prepended to the sub-agent's system prompt. */
  systemPrompt: string
}

export const BUILTIN_AGENT_TYPES: readonly AgentType[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    description:
      'Read-only researcher — reads, lists, and searches the codebase to answer a focused question. Cannot modify files or run commands.',
    toolPolicy: 'readonly',
    systemPrompt:
      'You are an Explorer sub-agent. Investigate the delegated question by reading, listing, and searching only. Do NOT modify files or run commands. Return a concise, well-organized findings report with concrete file:line references.'
  },
  {
    id: 'coder',
    name: 'Coder',
    description:
      'Full-access implementer — reads and edits files and runs commands to complete a self-contained task.',
    toolPolicy: 'full',
    systemPrompt:
      'You are a Coder sub-agent. Complete the delegated, self-contained task end to end: make the necessary edits and run commands as needed, then return a short summary of exactly what you changed.'
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Read-only reviewer — inspects code or a change and reports issues, risks, and suggestions. Cannot modify files.',
    toolPolicy: 'readonly',
    systemPrompt:
      'You are a Reviewer sub-agent. Review the delegated code or change read-only. Report correctness bugs, risks, and concrete suggestions, most important first. Do NOT modify files or run commands.'
  }
] as const

export const DEFAULT_AGENT_TYPE_ID = 'explorer'

/** Resolve an agent-type id to its definition, falling back to the default. */
export function getAgentType(id: string | undefined): AgentType {
  return (
    BUILTIN_AGENT_TYPES.find((a) => a.id === id) ??
    BUILTIN_AGENT_TYPES.find((a) => a.id === DEFAULT_AGENT_TYPE_ID)!
  )
}

/** Agent types a parent under `policy` is allowed to spawn (read-only can't escalate). */
export function allowedAgentTypes(policy: ToolPolicy): readonly AgentType[] {
  return policy === 'readonly'
    ? BUILTIN_AGENT_TYPES.filter((t) => t.toolPolicy === 'readonly')
    : BUILTIN_AGENT_TYPES
}

export const SUBAGENT_TOOL_NAME = 'spawn_subagent'

/** Max nesting depth for sub-agents (the top-level agent is depth 0). */
export const MAX_SUBAGENT_DEPTH = 2

/** Whether an agent at `depth` may still spawn a sub-agent. */
export function canSpawnSubagent(depth: number, maxDepth = MAX_SUBAGENT_DEPTH): boolean {
  return depth < maxDepth
}

/** Build the `spawn_subagent` tool definition, offering `types` as the enum. */
export function subagentTool(types: readonly AgentType[] = BUILTIN_AGENT_TYPES): object {
  const ids = types.map((t) => t.id)
  const menu = types.map((t) => `"${t.id}" — ${t.name}: ${t.description}`).join(' ')
  return {
    type: 'function',
    function: {
      name: SUBAGENT_TOOL_NAME,
      description: `Delegate a self-contained subtask to a fresh sub-agent with its own focused context, then get back a concise result. Use it to isolate or parallelize work — e.g. "explore how X works", "implement and verify Y", "review Z" — without cluttering your own context. Agent types: ${menu}`,
      parameters: {
        type: 'object',
        properties: {
          agent_type: {
            type: 'string',
            enum: ids,
            description: 'Which kind of sub-agent to run.'
          },
          task: {
            type: 'string',
            description:
              'The self-contained task or question for the sub-agent, including all context it needs.'
          }
        },
        required: ['agent_type', 'task']
      }
    }
  }
}

/** Pull the task text out of a spawn_subagent call (tolerant of key aliases). */
export function extractSubagentTask(args: Record<string, unknown>): string {
  const raw = args.task ?? args.prompt ?? args.instructions ?? args.question
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Pull the requested agent-type id out of a spawn_subagent call. */
export function extractSubagentTypeId(args: Record<string, unknown>): string {
  const raw = args.agent_type ?? args.type ?? args.agent ?? args.role
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * The policy a spawned child actually runs under. A read-only parent can never
 * grant full access to a child, so read-only is a floor once reached.
 */
export function effectiveChildPolicy(parentPolicy: ToolPolicy, requested: ToolPolicy): ToolPolicy {
  return parentPolicy === 'readonly' ? 'readonly' : requested
}

/** For a read-only policy, drop the mutating tools; 'full' keeps them all. */
export function filterToolsForPolicy(
  tools: object[],
  mutating: ReadonlySet<string>,
  policy: ToolPolicy
): object[] {
  if (policy === 'full') return tools
  return tools.filter((td) => {
    const name = (td as { function?: { name?: string } }).function?.name
    return !name || !mutating.has(name)
  })
}

/** Compose the string handed back to the parent agent as the tool result. */
export function formatSubagentResult(typeName: string, task: string, transcript: string): string {
  const body = (transcript ?? '').trim() || '(no output)'
  return `[${typeName} sub-agent] task: ${task}\n\n${body}`
}
