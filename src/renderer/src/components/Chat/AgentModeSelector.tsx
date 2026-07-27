import { agentMode, agentModeAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps } from 'react'
import { Menu } from '@renderer/ui/Menu'
import { cn, t } from '@renderer/utils/utils'
import { LuBot } from 'react-icons/lu'

const MODES: { value: agentMode; label: string; hint: string }[] = [
  { value: 'manual', label: 'Manual', hint: 'Approve every file edit and command' },
  { value: 'acceptEdits', label: 'Accept edits', hint: 'Auto-apply file edits; still confirm commands' },
  { value: 'plan', label: 'Plan', hint: 'Read-only: explores and produces a plan, no changes' },
  { value: 'auto', label: 'Auto', hint: 'Runs edits and commands without asking' }
]

export const AgentModeSelector = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [mode, setMode] = useAtom(agentModeAtom)
  const current = MODES.find((m) => m.value === mode) ?? MODES[0]

  return (
    <div className={cn('text-xs', className)} {...props}>
      <Menu.Root modal={false}>
        <Menu.Trigger
          className={cn(
            'flex items-center gap-1 transition-opacity',
            mode === 'plan' ? 'opacity-100 text-emerald-400' : 'opacity-100 text-blue-400'
          )}
        >
          <LuBot /> {t(current.label)}
        </Menu.Trigger>
        <Menu.Content className="flex flex-col gap-1">
          {MODES.map((m) => (
            <Menu.Item
              key={m.value}
              onClick={() => setMode(m.value)}
              title={t(m.hint)}
              className={cn('w-full cursor-pointer', m.value === mode && 'font-semibold')}
            >
              {t(m.label)}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
    </div>
  )
}
