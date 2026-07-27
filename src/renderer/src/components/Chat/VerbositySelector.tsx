import { Verbosity, verbosityAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps } from 'react'
import { Menu } from '@renderer/ui/Menu'
import { cn, t } from '@renderer/utils/utils'
import { LuBrain } from 'react-icons/lu'

const LEVELS: { value: Verbosity; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Reasoning collapsed behind “Thinking…”' },
  { value: 'thinking', label: 'Thinking', hint: 'Keep the reasoning expanded' },
  { value: 'verbose', label: 'Verbose', hint: 'Reasoning and answer inline — nothing collapsed' },
  { value: 'summary', label: 'Summary', hint: 'Hide the reasoning — show the answer only' }
]

/**
 * Controls how much of a model's reasoning is SHOWN — display only, it never changes what the model
 * generates. Only has a visible effect for models that emit a separable reasoning trace (a
 * <think> block); models that write their reasoning as plain prose have nothing to separate.
 */
export const VerbositySelector = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [verbosity, setVerbosity] = useAtom(verbosityAtom)
  const current = LEVELS.find((l) => l.value === verbosity) ?? LEVELS[0]

  return (
    <div className={cn('text-xs', className)} {...props}>
      <Menu.Root modal={false}>
        <Menu.Trigger
          className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
          title={t('Reasoning display')}
        >
          <LuBrain /> {t(current.label)}
        </Menu.Trigger>
        <Menu.Content className="flex flex-col gap-1">
          {LEVELS.map((l) => (
            <Menu.Item
              key={l.value}
              onClick={() => setVerbosity(l.value)}
              title={t(l.hint)}
              className={cn('w-full cursor-pointer', l.value === verbosity && 'font-semibold')}
            >
              {t(l.label)}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
    </div>
  )
}
