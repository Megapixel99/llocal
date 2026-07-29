import { ComponentProps } from 'react'
import { LuArchive, LuRefreshCw } from 'react-icons/lu'
import { twMerge } from 'tailwind-merge'
import { useCompact } from '@renderer/hooks/useCompact'
import { t } from '@renderer/utils/utils'

/**
 * Compact the current conversation (summarize older turns). Hidden until there is
 * enough history to compact; highlighted amber when the context window is near full.
 */
export const CompactButton = ({ className, ...props }: ComponentProps<'button'>): React.ReactElement | null => {
  const { compact, compacting, canCompact, nearFull } = useCompact()
  if (!canCompact) return null

  return (
    <button
      type="button"
      onClick={() => compact()}
      disabled={compacting}
      title={t('Summarize older messages to free up the context window')}
      className={twMerge(
        `flex items-center gap-1 text-xs transition-opacity ${nearFull ? 'text-amber-500 opacity-100' : 'opacity-60 hover:opacity-100'}`,
        className
      )}
      {...props}
    >
      {compacting ? <LuRefreshCw className="animate-spin" /> : <LuArchive />}
      {compacting ? t('Compacting…') : t('Compact')}
    </button>
  )
}
