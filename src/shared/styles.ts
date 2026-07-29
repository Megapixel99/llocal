/**
 * Custom instructions + response styles (Claude-parity).
 *
 * The user can set free-text "custom instructions" (a persistent persona /
 * preferences) and pick a response "style" preset. Both are combined into a single
 * system-prompt string that is prepended to model requests on the Chat tab — see
 * usePrompt.tsx (plain chat) and agents.ts (reasoning / research), which append it
 * to their own system prompts. Pure string logic, no DOM/Electron, so it is shared
 * and unit-testable.
 */

export type ResponseStyleId = 'normal' | 'concise' | 'explanatory' | 'formal'

export interface ResponseStyle {
  id: ResponseStyleId
  label: string
  description: string
  /** Appended to the system prompt; empty for the default 'normal' style. */
  directive: string
}

export const RESPONSE_STYLES: ResponseStyle[] = [
  { id: 'normal', label: 'Normal', description: 'Balanced default responses.', directive: '' },
  {
    id: 'concise',
    label: 'Concise',
    description: 'Short, direct answers.',
    directive:
      'Be concise and direct. Give the shortest answer that fully addresses the request; skip preamble, restating the question, and filler.'
  },
  {
    id: 'explanatory',
    label: 'Explanatory',
    description: 'Thorough, with context and examples.',
    directive:
      'Be thorough and educational. Explain the reasoning behind your answer and include helpful context, trade-offs, and examples where useful.'
  },
  {
    id: 'formal',
    label: 'Formal',
    description: 'Professional tone and precise language.',
    directive:
      'Use a formal, professional tone and precise language. Avoid slang and overly casual phrasing.'
  }
]

export function styleById(id: string): ResponseStyle {
  return RESPONSE_STYLES.find((s) => s.id === id) ?? RESPONSE_STYLES[0]
}

/**
 * Combine free-text custom instructions with the selected style's directive into
 * one system-prompt string. Returns '' when there is nothing to add, so callers
 * can cheaply decide whether to inject a system message at all.
 */
export function buildSystemInstructions(customInstructions: string, styleId: string): string {
  const parts: string[] = []
  const ci = (customInstructions ?? '').trim()
  if (ci) parts.push(ci)
  const dir = styleById(styleId).directive
  if (dir) parts.push(dir)
  return parts.join('\n\n')
}
