/**
 * Cross-conversation memory (Claude-parity) — pure helpers.
 *
 * Memory is a small set of durable facts/preferences the assistant should carry
 * between chats. Two pure pieces live here: detecting an explicit "remember …"
 * capture in a user message, and rendering the stored memories into a system-prompt
 * block for recall. Storage + injection live in the renderer (store/mocks, usePrompt).
 */

/**
 * If `text` is an explicit memory command ("remember (that|to) …"), return the fact
 * to store; otherwise null. Kept strict (must START with "remember") to avoid
 * capturing incidental uses like "remember when we…".
 */
export function parseRememberCommand(text: string): string | null {
  const m = /^\s*remember(?:\s+that|\s+to)?\s*[:,]?\s+(.+)$/is.exec(text)
  if (!m) return null
  const fact = m[1].trim().replace(/\s+/g, ' ')
  return fact.length > 0 ? fact : null
}

/**
 * Render memories into a system-prompt block for recall ('' when there are none).
 * Deduplicated, trimmed, blank-free.
 */
export function buildMemoryBlock(memories: string[]): string {
  const items = memories.map((m) => m.trim()).filter(Boolean)
  const unique = [...new Set(items)]
  if (unique.length === 0) return ''
  return `What you remember about the user (from earlier conversations — use when relevant, don't recite verbatim):\n${unique
    .map((m) => `- ${m}`)
    .join('\n')}`
}
