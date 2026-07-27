import { Effort, effortAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps } from 'react'
import { Menu } from '@renderer/ui/Menu'
import { cn, t } from '@renderer/utils/utils'
import { LuGauge } from 'react-icons/lu'

const LEVELS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'DeepResearch: fewer searches, faster' },
  { value: 'medium', label: 'Medium', hint: 'DeepResearch: balanced breadth' },
  { value: 'high', label: 'High', hint: 'DeepResearch: more searches, more thorough' }
]

/**
 * Sets the DeepResearch effort level (how many web searches a research run performs). Research mode is
 * chosen automatically by the router in usePrompt — this only controls its depth, not whether it runs.
 * */
export const EffortSelector = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [effort, setEffort] = useAtom(effortAtom)
  const current = LEVELS.find((l) => l.value === effort) ?? LEVELS[1]

  return (
    <div className={cn('text-xs', className)} {...props}>
      <Menu.Root modal={false}>
        <Menu.Trigger
          className="flex items-center gap-1 opacity-100 text-purple-400 transition-opacity"
          title={t('Research effort')}
        >
          <LuGauge /> {t(current.label)}
        </Menu.Trigger>
        <Menu.Content className="flex flex-col gap-1">
          {LEVELS.map((l) => (
            <Menu.Item
              key={l.value}
              onClick={() => setEffort(l.value)}
              title={t(l.hint)}
              className={cn('w-full cursor-pointer', l.value === effort && 'font-semibold')}
            >
              {t(l.label)}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
    </div>
  )
}
