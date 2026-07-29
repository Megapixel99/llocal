import { useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { chatAtom, prefModelAtom, contextUsageAtom } from '@renderer/store/mocks'
import { useDb } from './useDb'
import { t } from '@renderer/utils/utils'
import { canCompact, summarizeConversation, applyCompaction } from '@renderer/utils/compact'

/** Fraction of the context window past which we nudge the user to compact. */
const NUDGE_AT = 0.8

interface UseCompactReturn {
  compact: () => Promise<void>
  compacting: boolean
  /** Enough history to compact. */
  canCompact: boolean
  /** Context window is getting full — worth surfacing the action prominently. */
  nearFull: boolean
}

/**
 * Summarize the older part of the current chat into one message and keep the recent
 * tail (see utils/compact.ts). Persists + syncs the compacted chat via useDb.
 */
export function useCompact(): UseCompactReturn {
  const [chat, setChat] = useAtom(chatAtom)
  const model = useAtomValue(prefModelAtom)
  const { used, total } = useAtomValue(contextUsageAtom)
  const { addChat } = useDb()
  const [compacting, setCompacting] = useState(false)

  const nearFull = total > 0 && used / total >= NUDGE_AT

  async function compact(): Promise<void> {
    if (compacting || !canCompact(chat)) return
    if (!model) {
      toast.error(t('Select a model first'))
      return
    }
    setCompacting(true)
    const id = toast.loading(t('Compacting conversation…'))
    try {
      const summary = await summarizeConversation(model, chat)
      const next = applyCompaction(chat, summary)
      if (next === chat) {
        toast.error(t('Could not compact — no summary was produced'), { id })
        return
      }
      setChat(next)
      await addChat(next) // persist + sync the compacted history
      toast.success(t('Conversation compacted'), { id })
    } catch (e) {
      toast.error(`${t('Compaction failed')}: ${e instanceof Error ? e.message : e}`, { id })
    } finally {
      setCompacting(false)
    }
  }

  return { compact, compacting, canCompact: canCompact(chat), nearFull }
}
