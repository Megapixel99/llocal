import { workingFolderAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { LuFolderOpen, LuX } from 'react-icons/lu'
import { toast } from 'sonner'

/**
 * Lets the user choose a persistent "working folder" (like a project directory), independent of the
 * RAG knowledge base. The git panel (GitPanel) attaches to whatever folder is chosen here.
 * */
export const WorkspaceFolder = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [folder, setFolder] = useAtom(workingFolderAtom)
  const name = folder ? folder.split('/').filter(Boolean).pop() : ''

  async function choose(): Promise<void> {
    const picked = await window.api.selectFolder()
    if (picked) {
      setFolder(picked)
      toast.success(`${t('Working folder set to')} ${picked}`)
    }
  }

  return (
    <div className={cn('flex items-center gap-1 text-xs opacity-60', className)} {...props}>
      <button
        type="button"
        onClick={choose}
        title={folder || t('Choose a folder to work in')}
        className="flex items-center gap-2 hover:opacity-100 transition-opacity"
      >
        <LuFolderOpen />
        <span className="max-w-[12rem] truncate">{name || t('Choose folder')}</span>
      </button>
      {folder && (
        <button
          type="button"
          onClick={() => setFolder('')}
          title={t('Clear working folder')}
          className="hover:opacity-100 transition-opacity"
        >
          <LuX />
        </button>
      )}
    </div>
  )
}
