import { workingFolderAtom } from '@renderer/store/mocks'
import { useAtomValue, useSetAtom } from 'jotai'
import { ComponentProps, useEffect, useState } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { Button } from '@renderer/ui/Button'
import { Menu } from '@renderer/ui/Menu'
import { Modal } from '@renderer/ui/Modal'
import { toast } from 'sonner'
import { LuGitBranch } from 'react-icons/lu'

// Types derived from the preload API so we don't depend on global interface visibility.
type GitInfo = Awaited<ReturnType<typeof window.api.getGitInfo>>
type GitCaps = Awaited<ReturnType<typeof window.api.getGitCapabilities>>
type Worktrees = Awaited<ReturnType<typeof window.api.listWorktrees>>

const fieldClass =
  'p-2 rounded-lg bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 outline-none text-sm w-full'

/**
 * Git panel for the folder added as context — shown only "when applicable" (the folder is a git repo).
 * Surfaces branch/status, lets the user create a worktree, and (if the gh CLI is installed + authed)
 * open a pull request. Degrades gracefully based on which CLIs are available.
 * */
export const GitPanel = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement | null => {
  const folder = useAtomValue(workingFolderAtom)
  const setWorkingFolder = useSetAtom(workingFolderAtom)
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [caps, setCaps] = useState<GitCaps | null>(null)
  const [worktrees, setWorktrees] = useState<Worktrees>([])
  const [wtName, setWtName] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    if (!folder) {
      setInfo(null)
      return
    }
    try {
      const [gitInfo, capabilities] = await Promise.all([
        window.api.getGitInfo(folder),
        window.api.getGitCapabilities()
      ])
      setInfo(gitInfo)
      setCaps(capabilities)
      if (gitInfo.isRepo) setWorktrees(await window.api.listWorktrees(folder))
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  // "when applicable": nothing to show unless the context folder is a git repository
  if (!folder || !info?.isRepo) return null

  const handleCreateWorktree = async (): Promise<void> => {
    setBusy(true)
    const id = toast.loading(t('Creating worktree'))
    try {
      const created = await window.api.createWorktree(folder, wtName)
      // Make the new worktree the working directory so the agent/git panel operate inside it.
      setWorkingFolder(created)
      toast.success(`${t('Switched to new worktree')} ${created}`, { id })
      setWtName('')
    } catch (error) {
      toast.error(String(error), { id })
    } finally {
      setBusy(false)
    }
  }

  const handleCreatePR = async (): Promise<void> => {
    setBusy(true)
    const id = toast.loading(t('Creating pull request'))
    try {
      const url = await window.api.createPullRequest(folder, prTitle, prBody)
      toast.success(url || t('Pull request created'), { id })
      setPrTitle('')
      setPrBody('')
    } catch (error) {
      toast.error(String(error), { id })
    } finally {
      setBusy(false)
    }
  }

  const repoName = info.root?.split('/').pop()
  const prHint = !caps?.gh
    ? t('GitHub CLI (gh) is not installed')
    : !caps?.ghAuth
      ? t('gh is not authenticated — run: gh auth login')
      : undefined

  return (
    <div className={cn('flex items-center gap-2 text-xs opacity-70 flex-wrap', className)} {...props}>
      <LuGitBranch />
      <span className="font-medium">{info.branch}</span>
      {info.dirty && (
        <span className="size-2 rounded-full bg-amber-500" title={t('Uncommitted changes')} />
      )}
      {(info.ahead || info.behind) && (
        <span title={t('Ahead / behind upstream')}>
          ↑{info.ahead ?? 0} ↓{info.behind ?? 0}
        </span>
      )}
      {repoName && <span className="opacity-60">· {repoName}</span>}

      {/* Worktree switcher: click to make any worktree the working directory */}
      {worktrees.length > 0 && (
        <Menu.Root modal={false}>
          <Menu.Trigger className="opacity-60 hover:opacity-100 transition-opacity">
            · {worktrees.length} {worktrees.length === 1 ? t('worktree') : t('worktrees')}
          </Menu.Trigger>
          <Menu.Content className="flex max-h-64 flex-col gap-1 overflow-auto">
            {worktrees.map((wt) => {
              const name = wt.path.split('/').filter(Boolean).pop()
              const active = wt.path === info.root
              return (
                <Menu.Item
                  key={wt.path}
                  onClick={() => setWorkingFolder(wt.path)}
                  title={wt.path}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2',
                    active && 'font-semibold'
                  )}
                >
                  <LuGitBranch className="shrink-0 opacity-60" />
                  <span className="max-w-[14rem] truncate">{name}</span>
                  {wt.branch && <span className="opacity-50">({wt.branch})</span>}
                  {active && <span className="ml-auto opacity-70">✓</span>}
                </Menu.Item>
              )
            })}
          </Menu.Content>
        </Menu.Root>
      )}

      {/* Create worktree */}
      <Modal.Root>
        <Modal.Overlay />
        <Modal.Trigger>
          <Button variant="link" className="text-xs">
            {t('New worktree')}
          </Button>
        </Modal.Trigger>
        <Modal.Content className="flex w-80 flex-col gap-3 p-5">
          <Modal.Header className="text-base font-medium">{t('New git worktree')}</Modal.Header>
          <Modal.Description className="text-xs opacity-70">
            {t('Creates a new branch + worktree in a sibling folder of the repo.')}
          </Modal.Description>
          <input
            value={wtName}
            onChange={(e) => setWtName(e.target.value)}
            placeholder={t('branch / worktree name')}
            className={fieldClass}
          />
          <div className="flex justify-end gap-2">
            <Modal.CancelTrigger>
              <Button variant="secondary" className="text-xs">
                {t('Cancel')}
              </Button>
            </Modal.CancelTrigger>
            <Modal.AcceptTrigger
              variant="primary"
              className="text-xs"
              disabled={!wtName.trim() || busy}
              callbackFn={handleCreateWorktree}
            >
              {t('Create')}
            </Modal.AcceptTrigger>
          </div>
        </Modal.Content>
      </Modal.Root>

      {/* Create PR */}
      <Modal.Root>
        <Modal.Overlay />
        <Modal.Trigger>
          <Button variant="link" className="text-xs" title={prHint}>
            {t('Create PR')}
          </Button>
        </Modal.Trigger>
        <Modal.Content className="flex w-96 flex-col gap-3 p-5">
          <Modal.Header className="text-base font-medium">{t('Create pull request')}</Modal.Header>
          {prHint && <p className="text-xs opacity-70">{prHint}</p>}
          <input
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            placeholder={t('PR title')}
            className={fieldClass}
          />
          <textarea
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            placeholder={t('PR description')}
            rows={4}
            className={fieldClass}
          />
          <div className="flex justify-end gap-2">
            <Modal.CancelTrigger>
              <Button variant="secondary" className="text-xs">
                {t('Cancel')}
              </Button>
            </Modal.CancelTrigger>
            <Modal.AcceptTrigger
              variant="primary"
              className="text-xs"
              disabled={!caps?.ghAuth || !prTitle.trim() || busy}
              callbackFn={handleCreatePR}
            >
              {t('Create PR')}
            </Modal.AcceptTrigger>
          </div>
        </Modal.Content>
      </Modal.Root>
    </div>
  )
}
