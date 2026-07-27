/**
 * "Research" tools for the coding agent.
 *
 * DeepResearch and Reasoning already power the Chat tab (auto-routed in
 * usePrompt via routeIntent). This module surfaces the SAME two capabilities to
 * the CODE side as agent tools the coding agent can call mid-task:
 *   - `reason`         — careful step-by-step thinking about a hard sub-problem
 *                        (algorithm design, tricky logic, a debugging strategy)
 *                        before touching files. Read-only.
 *   - `deep_research`  — bounded, cited web research for anything outside the
 *                        local codebase (library/API docs, versions, an error
 *                        message, current facts). Read-only.
 *
 * This file is intentionally PURE — just the tool schemas plus small helpers for
 * name-matching, tolerant argument extraction, and result formatting — so it can
 * be unit-tested without Ollama/Electron. The actual execution (calling
 * runReasoning / runDeepResearch) lives in agent.ts, mirroring how MCP tool
 * calls are routed there.
 */

export const REASON_TOOL_NAME = 'reason'
export const DEEP_RESEARCH_TOOL_NAME = 'deep_research'

/** Ollama function-calling definitions, appended to the coding agent's tool set. */
export const AGENT_RESEARCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: REASON_TOOL_NAME,
      description:
        'Think through a hard problem step by step BEFORE acting. Use for tricky logic, algorithm or data-structure design, a debugging strategy, or weighing architectural trade-offs. Returns careful reasoning and a conclusion. Does not read files or run commands.',
      parameters: {
        type: 'object',
        properties: {
          problem: {
            type: 'string',
            description: 'The problem or question to reason about, with any relevant context.'
          }
        },
        required: ['problem']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: DEEP_RESEARCH_TOOL_NAME,
      description:
        'Research a topic on the web and get a concise, cited summary. Use for up-to-date facts, library or API documentation, package versions, or understanding an unfamiliar error — anything not answerable from the local codebase. Returns a synthesized answer with sources. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to research (a focused question or topic).'
          }
        },
        required: ['query']
      }
    }
  }
] as const

const RESEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  REASON_TOOL_NAME,
  DEEP_RESEARCH_TOOL_NAME
])

/** Whether `name` is one of the agent research tools handled in the renderer. */
export function isResearchToolName(name: string): boolean {
  return RESEARCH_TOOL_NAMES.has(name)
}

/**
 * Pull the problem text out of a `reason` tool call. Models don't always use the
 * documented key, so we accept a few sensible aliases and fall back to empty.
 */
export function extractReasonProblem(args: Record<string, unknown>): string {
  const raw = args.problem ?? args.question ?? args.prompt ?? args.task ?? args.input
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Pull the query out of a `deep_research` tool call (tolerant of key aliases). */
export function extractResearchQuery(args: Record<string, unknown>): string {
  const raw = args.query ?? args.q ?? args.topic ?? args.question ?? args.prompt
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Compose the string handed back to the model as the `deep_research` tool
 * result: the synthesized answer, with any sources appended under a heading.
 */
export function formatResearchResult(content: string, sources?: string): string {
  const body = (content ?? '').trim()
  const src = (sources ?? '').trim()
  if (!body && !src) return 'No research results.'
  return src ? `${body}\n\nSources:\n${src}` : body
}
