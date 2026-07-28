import { useAtomValue } from 'jotai'
import { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'
import { syncStatusAtom } from '@renderer/store/mocks'
import { isServerConfigured } from '@renderer/platform/config'
import { t } from '@renderer/utils/utils'

/** Relative "x ago" for the last successful sync; coarse is fine for a status line. */
function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 5) return t('just now')
  if (s < 60) return `${s}s ${t('ago')}`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ${t('ago')}`
  return `${Math.round(m / 60)}h ${t('ago')}`
}

/**
 * Compact companion-server sync indicator for the sidebar footer. Hidden entirely
 * when no server is configured (the stock local-only app shows nothing).
 */
export const SyncStatus = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement | null => {
  const { state, lastSyncedAt } = useAtomValue(syncStatusAtom)
  if (!isServerConfigured()) return null

  const dot: Record<typeof state, string> = {
    idle: 'bg-gray-400',
    syncing: 'bg-blue-500 animate-pulse',
    ok: 'bg-green-500',
    offline: 'bg-amber-500'
  }
  const label: Record<typeof state, string> = {
    idle: t('Not synced yet'),
    syncing: t('Syncing…'),
    ok: lastSyncedAt ? `${t('Synced')} · ${ago(lastSyncedAt)}` : t('Synced'),
    offline: t('Offline — will retry')
  }

  return (
    <div
      className={twMerge('flex items-center gap-2 text-xs opacity-70', className)}
      title={t('Cross-device sync with your companion server')}
      {...props}
    >
      <span className={`size-2 shrink-0 rounded-full ${dot[state]}`} />
      <span className="truncate">{label[state]}</span>
    </div>
  )
}
