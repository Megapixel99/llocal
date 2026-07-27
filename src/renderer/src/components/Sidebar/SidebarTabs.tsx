import { activeTabAtom, appTab } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { LuCode, LuMessageSquare } from 'react-icons/lu'

const TABS: { value: appTab; label: string; Icon: typeof LuCode }[] = [
  { value: 'chat', label: 'Chat', Icon: LuMessageSquare },
  { value: 'agent', label: 'Code', Icon: LuCode }
]

/**
 * Left-sidebar tabs to switch between plain Chat and the coding Agent. The active tab decides
 * whether a prompt runs as a normal chat or drives the agent tool loop (see usePrompt).
 * */
export const SidebarTabs = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [tab, setTab] = useAtom(activeTabAtom)
  return (
    <div
      className={cn(
        'flex gap-1 p-1 rounded-xl bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20',
        className
      )}
      {...props}
    >
      {TABS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTab(value)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all',
            tab === value
              ? 'bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-40 opacity-100'
              : 'opacity-50 hover:opacity-80'
          )}
        >
          <Icon /> {t(label)}
        </button>
      ))}
    </div>
  )
}
