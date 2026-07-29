import { ComponentProps } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { LuFolderKanban } from 'react-icons/lu'
import { twMerge } from 'tailwind-merge'
import { projectsAtom, activeProjectIdAtom } from '@renderer/store/mocks'
import { t } from '@renderer/utils/utils'

const NEW_PROJECT = '__new__'

/**
 * Project switcher for the sidebar. Selecting a project scopes the chat list to it
 * and files new chats under it (see ChatList / useDb). "All chats" clears the scope.
 * Full editing (instructions, knowledge, delete) lives in Settings → Projects.
 */
export const ProjectBar = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const projects = useAtomValue(projectsAtom)
  const [activeProjectId, setActiveProjectId] = useAtom(activeProjectIdAtom)

  function onChange(value: string): void {
    if (value === NEW_PROJECT) {
      const name = window.prompt(t('New project name'))?.trim()
      if (!name) return
      const id = globalThis.crypto?.randomUUID?.() ?? `proj_${Date.now()}`
      // Create via the same storage the settings page uses (kept minimal here).
      const next = [{ id, name, instructions: '', knowledge: '' }, ...projects]
      localStorage.setItem('projects', JSON.stringify(next))
      // atomWithStorage picks up our own write on next read; set the atom too via a reload-free path:
      window.dispatchEvent(new StorageEvent('storage', { key: 'projects', newValue: JSON.stringify(next), storageArea: localStorage }))
      setActiveProjectId(id)
      return
    }
    setActiveProjectId(value === '' ? null : value)
  }

  return (
    <div className={twMerge('flex items-center gap-2', className)} {...props}>
      <LuFolderKanban className="shrink-0 opacity-60" />
      <select
        value={activeProjectId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-20 px-2 py-1.5 text-sm outline-none backdrop-blur"
        title={t('Project')}
      >
        <option value="">{t('All chats')}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value={NEW_PROJECT}>＋ {t('New project')}</option>
      </select>
    </div>
  )
}
