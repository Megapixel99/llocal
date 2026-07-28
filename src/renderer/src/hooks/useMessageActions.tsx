import { useAtomValue, useSetAtom } from 'jotai'
import { chatAtom, regenerateRequestAtom, type Message } from '@renderer/store/mocks'

export interface RegenRequest {
  prompt: string
  baseChat: Message[]
}

/**
 * Regenerate the assistant reply at `assistantIndex`: find the nearest preceding user message and
 * re-run it on the history before it. Returns null if there's no user prompt to re-run.
 */
export function computeRetry(chat: Message[], assistantIndex: number): RegenRequest | null {
  let u = assistantIndex - 1
  while (u >= 0 && chat[u]?.role !== 'user') u--
  if (u < 0) return null
  return { prompt: chat[u].content, baseChat: chat.slice(0, u) }
}

/**
 * Replace the user message at `userIndex` with `newContent` and re-run from that point. Returns null
 * for an empty edit.
 */
export function computeEdit(
  chat: Message[],
  userIndex: number,
  newContent: string
): RegenRequest | null {
  if (!newContent.trim()) return null
  return { prompt: newContent, baseChat: chat.slice(0, userIndex) }
}

/**
 * Claude-style message actions built on the regenerate mechanism: both truncate the conversation to
 * an earlier point and re-run from there (InputForm fulfils the request — it owns promptReq).
 */
export function useMessageActions(): {
  retry: (assistantIndex: number) => void
  editAndRun: (userIndex: number, newContent: string) => void
} {
  const chat = useAtomValue(chatAtom)
  const setRegen = useSetAtom(regenerateRequestAtom)

  return {
    retry: (assistantIndex) => {
      const req = computeRetry(chat, assistantIndex)
      if (req) setRegen(req)
    },
    editAndRun: (userIndex, newContent) => {
      const req = computeEdit(chat, userIndex, newContent)
      if (req) setRegen(req)
    }
  }
}
