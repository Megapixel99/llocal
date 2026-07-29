/**
 * Conversation compaction — summarize older turns so a long chat keeps fitting the
 * model's context window (like Claude Code's /compact). Older messages are replaced
 * by one summary message; the most recent turns are kept verbatim.
 */
import { getOllama } from './ollama'
import type { Message } from '../store/mocks'

/** How many of the most recent messages to keep verbatim when compacting. */
export const KEEP_RECENT = 4

/** A visible marker so a compacted summary is obviously not a normal model turn. */
export const SUMMARY_MARKER = '📝 **Summary of earlier conversation**'

/** True when there are enough older messages to be worth compacting. */
export function canCompact(messages: Message[]): boolean {
  return messages.length > KEEP_RECENT + 1
}

/** Render a transcript for the summarizer prompt. */
function transcript(messages: Message[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role}: ${m.content}`)
    .join('\n\n')
}

/**
 * Summarize `messages` into a compact briefing that preserves facts, decisions,
 * code, names, and open threads — enough for the model to continue seamlessly.
 */
export async function summarizeConversation(model: string, messages: Message[]): Promise<string> {
  const ollama = getOllama()
  const res = await ollama.chat({
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: `You compress a conversation so it can continue without losing context. Produce a dense summary that preserves: key facts and decisions, any code/identifiers/file paths, the user's goals and preferences, and unresolved questions or next steps. Use compact bullet points. Do NOT add commentary or address the user — output only the summary.`
      },
      { role: 'user', content: `Summarize this conversation so far:\n\n${transcript(messages)}` }
    ]
  })
  return res.message?.content?.trim() ?? ''
}

/**
 * Build the compacted message list: a single summary message followed by the last
 * KEEP_RECENT messages. Returns the original list unchanged if there's nothing to compact.
 */
export function applyCompaction(messages: Message[], summary: string): Message[] {
  if (!canCompact(messages) || !summary.trim()) return messages
  const recent = messages.slice(-KEEP_RECENT)
  const summaryMessage: Message = { role: 'assistant', content: `${SUMMARY_MARKER}\n\n${summary.trim()}` }
  return [summaryMessage, ...recent]
}
