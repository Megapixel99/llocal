import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const pexec = promisify(execFile)

export interface GitCapabilities {
  git: boolean // is the git CLI available
  gh: boolean // is the GitHub CLI available
  ghAuth: boolean // is gh authenticated (required to create PRs)
}

export interface GitInfo {
  isRepo: boolean
  branch?: string
  dirty?: boolean
  remote?: string
  ahead?: number
  behind?: number
  root?: string
}

export interface Worktree {
  path: string
  branch?: string
  head?: string
}

// Runs a git command in `cwd`, returning trimmed stdout or null if git errors (e.g. not a repo).
async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await pexec('git', args, { cwd })
    return stdout.trim()
  } catch {
    return null
  }
}

// Detects which CLIs are available so the UI can degrade gracefully.
export async function getGitCapabilities(): Promise<GitCapabilities> {
  const git = await pexec('git', ['--version']).then(() => true).catch(() => false)
  const gh = await pexec('gh', ['--version']).then(() => true).catch(() => false)
  let ghAuth = false
  if (gh) ghAuth = await pexec('gh', ['auth', 'status']).then(() => true).catch(() => false)
  return { git, gh, ghAuth }
}

export async function getGitInfo(folder: string): Promise<GitInfo> {
  if (!folder) return { isRepo: false }
  const inside = await tryGit(folder, ['rev-parse', '--is-inside-work-tree'])
  if (inside !== 'true') return { isRepo: false }

  const root = (await tryGit(folder, ['rev-parse', '--show-toplevel'])) ?? undefined
  const branch = (await tryGit(folder, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? undefined
  const status = await tryGit(folder, ['status', '--porcelain'])
  const dirty = status ? status.length > 0 : false
  const remote = (await tryGit(folder, ['remote', 'get-url', 'origin'])) ?? undefined

  let ahead: number | undefined
  let behind: number | undefined
  // --left-right --count returns "<behind>\t<ahead>" for upstream...HEAD; fails with no upstream.
  const counts = await tryGit(folder, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
  if (counts) {
    const [b, a] = counts.split(/\s+/).map((n) => Number(n))
    if (!Number.isNaN(b)) behind = b
    if (!Number.isNaN(a)) ahead = a
  }

  return { isRepo: true, branch, dirty, remote, ahead, behind, root }
}

export async function listWorktrees(folder: string): Promise<Worktree[]> {
  const out = await tryGit(folder, ['worktree', 'list', '--porcelain'])
  if (!out) return []
  const trees: Worktree[] = []
  let current: Partial<Worktree> = {}
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) trees.push(current as Worktree)
      current = { path: line.slice('worktree '.length) }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '')
    }
  }
  if (current.path) trees.push(current as Worktree)
  return trees
}

// Creates a new worktree + branch in a sibling directory of the repo root. Returns the new path.
export async function createWorktree(folder: string, name: string): Promise<string> {
  const safeName = name.trim().replace(/[^a-zA-Z0-9._/-]/g, '-')
  if (!safeName) throw new Error('A worktree name is required')
  const root = (await tryGit(folder, ['rev-parse', '--show-toplevel'])) ?? folder
  const target = path.join(path.dirname(root), `${path.basename(root)}-${safeName.replace(/\//g, '-')}`)
  await pexec('git', ['-C', root, 'worktree', 'add', target, '-b', safeName])
  return target
}

// Creates a PR for the repo via the GitHub CLI. Outward-facing — the renderer confirms before calling.
export async function createPullRequest(folder: string, title: string, body: string): Promise<string> {
  const { stdout } = await pexec('gh', ['pr', 'create', '--title', title, '--body', body], {
    cwd: folder
  })
  return stdout.trim()
}
