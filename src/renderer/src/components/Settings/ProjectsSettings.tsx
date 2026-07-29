import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { LuTrash2, LuFolderKanban, LuPlus } from 'react-icons/lu'
import { projectsAtom, activeProjectIdAtom, type Project } from '@renderer/store/mocks'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

/**
 * Manage projects: create, rename, edit per-project instructions + knowledge, and
 * delete. Projects group chats (see ChatList / ProjectBar) and their instructions +
 * knowledge are injected into every chat filed under them (see usePrompt). The
 * project list syncs across devices.
 */
export const ProjectsSettings = (): React.ReactElement => {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [activeProjectId, setActiveProjectId] = useAtom(activeProjectIdAtom)
  const [newName, setNewName] = useState('')

  function create(): void {
    const name = newName.trim()
    if (!name) return
    const id = globalThis.crypto?.randomUUID?.() ?? `proj_${Date.now()}`
    setProjects((prev) => [{ id, name, instructions: '', knowledge: '' } as Project, ...prev])
    setNewName('')
  }

  function update(id: string, patch: Partial<Project>): void {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function remove(id: string): void {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (activeProjectId === id) setActiveProjectId(null) // don't leave a dangling selection
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl w-full">
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg">
          <LuFolderKanban /> {t('Projects')}
        </h2>
        <p className="text-xs opacity-60">
          {t(
            'Group related chats and give each project its own instructions + knowledge, applied to every chat inside it.'
          )}
        </p>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder={t('New project name…')}
            className={fieldClass}
          />
          <Button variant="primary" onClick={create} disabled={!newName.trim()} className="flex items-center gap-1">
            <LuPlus /> {t('Create')}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {projects.length === 0 && <p className="text-xs opacity-50">{t('No projects yet.')}</p>}
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-xl bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  className={`${fieldClass} font-medium`}
                />
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  title={t('Delete project')}
                  className="shrink-0 opacity-50 transition-opacity hover:text-red-500 hover:opacity-100"
                >
                  <LuTrash2 />
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-70">{t('Instructions')}</span>
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={p.instructions}
                  placeholder={t('How the model should behave for this project.')}
                  onChange={(e) => update(p.id, { instructions: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-70">{t('Knowledge')}</span>
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={p.knowledge}
                  placeholder={t('Reference facts/context available to every chat in this project.')}
                  onChange={(e) => update(p.id, { knowledge: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
