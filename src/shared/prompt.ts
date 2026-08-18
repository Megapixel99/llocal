/**
 * The base system prompt.
 *
 * Every model call in the app starts from the same prompt so the assistant has one
 * voice, one set of formatting habits, and one honesty rule — instead of whatever a
 * given GGUF's chat template happens to default to. Before this existed, plain chat
 * sent NO system message at all unless the user had typed custom instructions, which
 * is why small local models rambled, restated the question, and dressed two-sentence
 * answers up with headings.
 *
 * Layering (outermost first), mirroring how a desktop agent harness composes a turn:
 *   1. base identity + behavior + formatting + honesty        (BASE_PROMPT)
 *   2. task rules for this flow                               (MODE_RULES[mode])
 *   3. environment facts the model cannot know                (date, platform, model)
 *   4. the user's persistent configuration, last and loudest  (buildUserLayer)
 *
 * Pure string logic — no DOM, no Electron — so it is shared by the desktop renderer,
 * the mobile/web build, and the unit tests.
 */

export type PromptMode = 'chat' | 'reason' | 'research' | 'agent'

/** Identity, behavior, formatting and honesty rules shared by every flow. */
export const BASE_PROMPT = `You are the assistant in LLocal, a desktop app that runs open-weight models locally through Ollama on the user's own machine.

Answer the question that was actually asked. Keep answers concrete and useful — less is more. Be brief and to the point without leaving out anything that matters, and never say more than you need to. When a request is ambiguous in a way that would change your answer, ask one clarifying question instead of guessing.

Skip the packaging: no restating the question, no "Great question", no preview of what you are about to say, no offer of further help at the end. Answer, then stop.

Default to plain prose. Use Markdown only where it earns its place — fenced code blocks tagged with the language for code and commands, lists for genuinely enumerable things, tables for tabular data. A short answer gets no headings.

Anything outside this conversation — the web, the user's files, the state of their machine — reaches you only as search results, attachments, or tool output shown to you here. Everything else comes from training data, which has a cutoff. Where something may have moved on since then, still give your best answer and mark it as possibly out of date; don't refuse and point at a website. Say plainly when you are unsure, rather than hedging every sentence, and never invent sources, URLs, quotes, APIs, file contents, or command output. Cite web sources as Markdown links to their original URL, and refer to files by relative path.`

/** Task rules layered on top of BASE_PROMPT, one per flow. */
export const MODE_RULES: Record<PromptMode, string> = {
  // Plain chat needs nothing beyond the base — every extra sentence costs a small
  // local model attention it could spend on the actual question.
  chat: '',
  reason: `Work this one out before answering. Put your full working inside a single <think>...</think> block: restate the problem, break it into steps, do each step, then check it for mistakes. After </think>, give the answer on its own — state the conclusions, don't replay the reasoning. Always include the <think> block, even for a short problem.`,
  research: `Answer only from the search findings provided in this conversation. Attach a Markdown link to the source behind each substantive claim. Where the findings don't cover something, say so instead of filling the gap from memory — and never invent a URL, a quote, or a number.`,
  agent: `Read, list, and search to understand the project before you change anything. Prefer the smallest change that does the job, and match the style of the code around it. When the task is done, stop calling tools and give a short summary of what you actually changed.`
}

export interface EnvironmentFacts {
  /** ISO date (YYYY-MM-DD). The model has no clock; without this it guesses its cutoff year. */
  date?: string
  /** 'macOS' | 'Windows' | 'Linux' | … — shell/path advice is wrong without it. */
  platform?: string
  /** The Ollama model tag actually serving this turn. */
  model?: string
  /** Agent flows only: the folder the agent is working in. */
  workspace?: string
}

export interface SystemPromptContext extends EnvironmentFacts {
  mode?: PromptMode
  /** The user's persistent configuration, pre-composed by buildUserLayer(). */
  user?: string
  /** One-off notes about this turn (an attached document, an active search, …). */
  notes?: string[]
}

/** The "Environment:" block — facts about the here-and-now the weights cannot contain. */
export function buildEnvironmentBlock(facts: EnvironmentFacts): string {
  const lines: string[] = []
  if (facts.date) lines.push(`Today's date is ${facts.date}.`)
  if (facts.platform) lines.push(`The user is on ${facts.platform}.`)
  if (facts.model) lines.push(`You are running locally as "${facts.model}" via Ollama.`)
  if (facts.workspace)
    lines.push(`Working folder: ${facts.workspace} (all paths are relative to it).`)
  return lines.length ? `Environment:\n${lines.join('\n')}` : ''
}

/**
 * Compose the user's persistent configuration — custom instructions + style directive,
 * the active project's instructions/knowledge, and recalled memory — into one block.
 * Returns '' when the user has configured nothing, so the prompt stays lean by default.
 */
export function buildUserLayer(parts: {
  instructions?: string
  project?: string
  memory?: string
}): string {
  const sections = [
    parts.instructions?.trim() ? `Custom instructions:\n${parts.instructions.trim()}` : '',
    parts.project?.trim() ?? '',
    parts.memory?.trim() ?? ''
  ].filter(Boolean)
  if (sections.length === 0) return ''
  return [
    `The user configured the following. It outranks the general guidance above; an explicit request in the conversation outranks both.`,
    ...sections
  ].join('\n\n')
}

/** Build the full system prompt for one turn. Always returns a non-empty string. */
export function buildSystemPrompt(ctx: SystemPromptContext = {}): string {
  const notes = (ctx.notes ?? []).map((n) => n.trim()).filter(Boolean)
  return [
    BASE_PROMPT,
    MODE_RULES[ctx.mode ?? 'chat'],
    notes.length ? notes.join('\n') : '',
    buildEnvironmentBlock(ctx),
    ctx.user?.trim() ?? ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Read the date and platform off the host at call time. Kept separate from
 * buildSystemPrompt so that function stays pure and testable; callers in the
 * renderer pass the result straight through.
 */
export function currentEnvironment(): { date: string; platform: string } {
  const date = new Date().toISOString().slice(0, 10)
  // navigator is absent under vitest/node; userAgentData is Chromium-only.
  const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator
  const ua = nav?.userAgent ?? ''
  const platform = /Mac|iPhone|iPad/.test(ua)
    ? 'macOS'
    : /Win/.test(ua)
      ? 'Windows'
      : /Linux|Android|X11/.test(ua)
        ? 'Linux'
        : ''
  return { date, platform }
}
