import { workingFolderAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { ComponentProps, useState } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { LuFolderOpen, LuGitBranch, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { isElectron } from '@renderer/platform/detect'
import { getGitConfig, saveRemoteConfig } from '@renderer/platform/config'
import { git } from '@renderer/platform/serverClient'
import { Modal } from '@renderer/ui/Modal'
import { Button } from '@renderer/ui/Button'

const fieldClass =
  'p-2 rounded-lg bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 outline-none text-sm w-full'

// Recently-picked repos (owner/repo), newest first, for quick re-selection on mobile.
function getRecentRepos(): string[] {
  try {
    return JSON.parse(localStorage.getItem('recentRepos') || '[]')
  } catch {
    return []
  }
}
function addRecentRepo(slug: string): void {
  const list = [slug, ...getRecentRepos().filter((r) => r !== slug)].slice(0, 5)
  localStorage.setItem('recentRepos', JSON.stringify(list))
}

/**
 * Desktop: pick a local working folder. Mobile (Capacitor/web): there are no local folders, so
 * pick a GitHub repository instead — it's cloned on the companion server and becomes the active
 * repo for Repo & Console. Set the server URL + token under Settings → Server & Repository first.
 */
export const WorkspaceFolder = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [folder, setFolder] = useAtom(workingFolderAtom)

  // --- Desktop: native local-folder picker (unchanged) ---
  if (isElectron()) {
    const name = folder ? folder.split('/').filter(Boolean).pop() : ''
    const choose = async (): Promise<void> => {
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
          <button type="button" onClick={() => setFolder('')} title={t('Clear working folder')}>
            <LuX />
          </button>
        )}
      </div>
    )
  }

  // --- Mobile: GitHub repository picker ---
  return <RepoPicker className={className} folder={folder} setFolder={setFolder} {...props} />
}

const RepoPicker = ({
  className,
  folder,
  setFolder,
  ...props
}: ComponentProps<'div'> & { folder: string; setFolder: (v: string) => void }): React.ReactElement => {
  const cfg = getGitConfig()
  const [owner, setOwner] = useState(cfg.owner)
  const [repo, setRepo] = useState(cfg.repo)
  const [branch, setBranch] = useState(cfg.branch || 'main')
  const [busy, setBusy] = useState(false)
  const recents = getRecentRepos()

  const current = cfg.owner && cfg.repo ? `${cfg.owner}/${cfg.repo}` : folder

  const useRepo = async (): Promise<void> => {
    const o = owner.trim()
    const r = repo.trim()
    if (!o || !r) return
    setBusy(true)
    const id = toast.loading(t('Cloning repository'))
    // Persist the selection first so git.clone() (which reads the config) targets it.
    saveRemoteConfig({ git: { ...getGitConfig(), owner: o, repo: r, branch: branch.trim() || 'main' } })
    addRecentRepo(`${o}/${r}`)
    setFolder(`${o}/${r}`)
    try {
      const res = await git.clone()
      toast.success(`${t('Repository ready')}: ${res.repoKey}`, { id })
    } catch (error) {
      const msg = String(error).split(':').pop()?.trim()
      toast.error(`${t('Selected, but clone failed (check the companion server)')}: ${msg}`, { id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('text-xs opacity-60', className)} {...props}>
      <Modal.Root>
        <Modal.Overlay />
        <Modal.Trigger>
          <button
            type="button"
            className="flex items-center gap-2 hover:opacity-100 transition-opacity"
            title={t('Choose a GitHub repository')}
          >
            <LuGitBranch />
            <span className="max-w-[12rem] truncate">{current || t('Choose repo')}</span>
          </button>
        </Modal.Trigger>
        <Modal.Content className="flex w-80 flex-col gap-3 p-5">
          <Modal.Header className="text-base font-medium">{t('Choose a GitHub repository')}</Modal.Header>
          <Modal.Description className="text-xs opacity-70">
            {t('Cloned on the companion server. Set the server URL + token under Settings → Server & Repository.')}
          </Modal.Description>
          {recents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recents.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    const [o, r] = slug.split('/')
                    setOwner(o ?? '')
                    setRepo(r ?? '')
                  }}
                  className="rounded-lg bg-foreground bg-opacity-10 px-2 py-1 hover:bg-opacity-20"
                >
                  {slug}
                </button>
              ))}
            </div>
          )}
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t('Owner')} className={fieldClass} />
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={t('Repository')} className={fieldClass} />
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t('Branch (default main)')} className={fieldClass} />
          <div className="flex justify-end gap-2">
            <Modal.CancelTrigger>
              <Button variant="secondary" className="text-xs">
                {t('Cancel')}
              </Button>
            </Modal.CancelTrigger>
            <Modal.AcceptTrigger
              variant="primary"
              className="text-xs"
              disabled={!owner.trim() || !repo.trim() || busy}
              callbackFn={useRepo}
            >
              {t('Use repository')}
            </Modal.AcceptTrigger>
          </div>
        </Modal.Content>
      </Modal.Root>
    </div>
  )
}
