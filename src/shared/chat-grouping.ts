/**
 * Pure helpers for the sidebar chat list: recency bucketing + search matching.
 * No DOM/Electron, so they're shared and unit-testable. Chats are keyed by an ISO
 * timestamp `date`; bucketing compares calendar days in local time.
 */

export type RecencyBucket = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'

/** Bucket order for rendering group headers top-to-bottom (most recent first). */
export const RECENCY_ORDER: RecencyBucket[] = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older'
]

/** Midnight (local) of the day containing `ms`, as epoch ms. */
function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Which recency bucket an ISO date falls in, relative to `nowMs`. */
export function recencyBucket(iso: string, nowMs: number): RecencyBucket {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'Older'
  const today = startOfDay(nowMs)
  const dayMs = 86_400_000
  const dayStart = startOfDay(t)
  const daysAgo = Math.round((today - dayStart) / dayMs)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo <= 7) return 'Previous 7 days'
  if (daysAgo <= 30) return 'Previous 30 days'
  return 'Older'
}

/**
 * Case-insensitive match of a query against a chat's title and message contents.
 * Empty/blank query matches everything (so the list is unfiltered by default).
 */
export function chatMatchesQuery(
  chat: { title?: string; chat?: { content?: string }[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if ((chat.title ?? '').toLowerCase().includes(q)) return true
  return (chat.chat ?? []).some((m) => (m.content ?? '').toLowerCase().includes(q))
}
