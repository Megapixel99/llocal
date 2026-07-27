import { contextUsageAtom } from '@renderer/store/mocks'
import { useAtomValue } from 'jotai'
import { ComponentProps } from 'react'
import { cn, t } from '@renderer/utils/utils'

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * Compact indicator of how full the model's context window is, based on the token counts Ollama
 * returns with each response. Hidden until there is something to show.
 * */
export const ContextInfo = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement | null => {
  const { used, total } = useAtomValue(contextUsageAtom)
  if (!used && !total) return null
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null

  return (
    <div
      className={cn('flex items-center gap-2 text-xs opacity-60', className)}
      title={t('Context window usage')}
      {...props}
    >
      <span>
        {formatTokens(used)}
        {total > 0 && ` / ${formatTokens(total)}`}
        {pct !== null && ` (${pct}%)`}
      </span>
      {total > 0 && (
        <span className="relative h-1 w-16 overflow-hidden rounded-full">
          <span className="absolute inset-0 rounded-full bg-current opacity-20" />
          <span
            className="absolute left-0 top-0 h-full rounded-full bg-current transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </div>
  )
}
