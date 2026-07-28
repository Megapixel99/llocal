import { useAtomValue, useSetAtom } from 'jotai'
import { ComponentProps } from 'react'
import { LuBox } from 'react-icons/lu'
import { prefModelAtom, settingsToggleAtom } from '@renderer/store/mocks'
import { cn, t } from '@renderer/utils/utils'

/**
 * Claude-style model indicator in the composer: shows the active model and opens Settings (where the
 * model picker lives) on click, so you always see and can switch which model you're talking to.
 */
export const ModelChip = ({ className, ...props }: ComponentProps<'button'>): React.ReactElement => {
  const model = useAtomValue(prefModelAtom)
  const openSettings = useSetAtom(settingsToggleAtom)

  return (
    <button
      type="button"
      onClick={() => openSettings((v) => !v)}
      title={t('Change model in Settings')}
      className={cn(
        'flex max-w-[12rem] items-center gap-1 text-xs opacity-60 transition-opacity hover:opacity-100',
        className
      )}
      {...props}
    >
      <LuBox className="shrink-0" />
      <span className="truncate">{model || t('No model')}</span>
    </button>
  )
}
