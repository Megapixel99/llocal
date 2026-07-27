/**
 * Git routes — the "edit an external repo instead of local files" capability.
 *
 * The server clones the repo to a working directory ON THE HOST, so edits and
 * any subsequent commands run on the host, not the phone. A provider-agnostic
 * interface keeps GitHub-specific bits isolated so GitLab/others can slot in
 * later; GitHub is the only implementation for now.
 */
import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { config } from './config.ts'
import { run } from './util.ts'

interface RepoRef {
  owner: string
  repo: string
  branch?: string
  token?: string
}

interface GitProvider {
  name: string
  /** Authenticated HTTPS clone URL. */
  cloneUrl(ref: RepoRef): string
  /** Create a pull request; returns the PR URL. */
  createPullRequest(
    ref: RepoRef,
    input: { title: string; body: string; head: string; base: string }
  ): Promise<{ url: string }>
  /** List repositories the token can access (for the mobile repo picker). */
  listRepos(ref: {
    token?: string
  }): Promise<Array<{ owner: string; repo: string; fullName: string; branch: string; private: boolean }>>
}

const gitHubProvider: GitProvider = {
  name: 'github',
  cloneUrl({ owner, repo, token }) {
    const auth = (token || config.githubToken) ? `${token || config.githubToken}@` : ''
    return `https://${auth}github.com/${owner}/${repo}.git`
  },
  async createPullRequest({ owner, repo, token }, input) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || config.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { html_url: string }
    return { url: data.html_url }
  },
  async listRepos({ token }) {
    const auth = token || config.githubToken
    if (!auth) throw new Error('No GitHub token configured')
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      { headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as Array<{
      full_name: string
      name: string
      owner: { login: string }
      default_branch: string
      private: boolean
    }>
    return data.map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      fullName: r.full_name,
      branch: r.default_branch,
      private: r.private
    }))
  }
}

function getProvider(_provider = 'github'): GitProvider {
  // Only GitHub for now; provider-agnostic seam for later.
  return gitHubProvider
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

function repoKeyOf(owner: string, repo: string): string {
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
    throw new Error('Invalid owner/repo')
  }
  return `${owner}__${repo}`
}

function repoDirOf(owner: string, repo: string): string {
  return path.join(config.reposDir, repoKeyOf(owner, repo))
}

/** Resolve a repo-relative path and refuse anything escaping the working dir. */
function safeJoin(repoDir: string, relPath: string): string {
  const resolved = path.resolve(repoDir, relPath)
  if (resolved !== repoDir && !resolved.startsWith(repoDir + path.sep)) {
    throw new Error('Path escapes repository')
  }
  return resolved
}

export const gitRouter = Router()

// Clone (or update) a repo into the host working directory.
gitRouter.post('/clone', async (req, res) => {
  try {
    const ref = req.body as RepoRef
    const provider = getProvider(req.body?.provider)
    const dir = repoDirOf(ref.owner, ref.repo)
    fs.mkdirSync(config.reposDir, { recursive: true })
    const branch = ref.branch || 'main'

    if (fs.existsSync(path.join(dir, '.git'))) {
      await run('git', ['-C', dir, 'fetch', '--all'])
      await run('git', ['-C', dir, 'checkout', branch])
      const pull = await run('git', ['-C', dir, 'pull', '--ff-only'])
      return res.json({ repoKey: repoKeyOf(ref.owner, ref.repo), dir, output: pull.stdout })
    }
    const clone = await run('git', [
      'clone',
      '--branch',
      branch,
      provider.cloneUrl(ref),
      dir
    ])
    if (clone.code !== 0) return res.status(500).json({ error: clone.stderr || 'clone failed' })
    res.json({ repoKey: repoKeyOf(ref.owner, ref.repo), dir })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// List repositories the configured token can access (mobile repo picker).
gitRouter.post('/repos', async (req, res) => {
  try {
    const token = (req.body as { token?: string })?.token
    const repos = await getProvider().listRepos({ token })
    res.json({ repos })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// List tracked files.
gitRouter.get('/tree', async (req, res) => {
  try {
    const { owner, repo } = req.query as { owner: string; repo: string }
    const dir = repoDirOf(owner, repo)
    const result = await run('git', ['-C', dir, 'ls-files'])
    res.json({ files: result.stdout.split('\n').filter(Boolean) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Read a file's contents.
gitRouter.get('/file', async (req, res) => {
  try {
    const { owner, repo, path: relPath } = req.query as {
      owner: string
      repo: string
      path: string
    }
    const dir = repoDirOf(owner, repo)
    const filePath = safeJoin(dir, relPath)
    const content = fs.readFileSync(filePath, 'utf-8')
    res.json({ path: relPath, content })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Write a file and commit it.
gitRouter.put('/file', async (req, res) => {
  try {
    const { owner, repo, path: relPath, content, message } = req.body as {
      owner: string
      repo: string
      path: string
      content: string
      message?: string
    }
    const dir = repoDirOf(owner, repo)
    const filePath = safeJoin(dir, relPath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    await run('git', ['-C', dir, 'add', relPath])
    const commit = await run('git', [
      '-C',
      dir,
      'commit',
      '-m',
      message || `Update ${relPath}`
    ])
    res.json({ ok: commit.code === 0, output: commit.stdout || commit.stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

gitRouter.post('/commit', async (req, res) => {
  try {
    const { owner, repo, message } = req.body as { owner: string; repo: string; message: string }
    const dir = repoDirOf(owner, repo)
    await run('git', ['-C', dir, 'add', '-A'])
    const commit = await run('git', ['-C', dir, 'commit', '-m', message || 'Update'])
    res.json({ ok: commit.code === 0, output: commit.stdout || commit.stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

gitRouter.post('/push', async (req, res) => {
  try {
    const { owner, repo, branch } = req.body as { owner: string; repo: string; branch?: string }
    const dir = repoDirOf(owner, repo)
    const args = ['-C', dir, 'push', 'origin', branch || 'HEAD']
    const push = await run('git', args)
    res.json({ ok: push.code === 0, output: push.stdout || push.stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

gitRouter.post('/pull', async (req, res) => {
  try {
    const { owner, repo } = req.body as { owner: string; repo: string }
    const dir = repoDirOf(owner, repo)
    const pull = await run('git', ['-C', dir, 'pull', '--ff-only'])
    res.json({ ok: pull.code === 0, output: pull.stdout || pull.stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

gitRouter.post('/pr', async (req, res) => {
  try {
    const ref = req.body as RepoRef
    const { title, body, head, base } = req.body as {
      title: string
      body: string
      head: string
      base: string
    }
    const provider = getProvider(req.body?.provider)
    const pr = await provider.createPullRequest(ref, {
      title,
      body: body || '',
      head,
      base: base || ref.branch || 'main'
    })
    res.json(pr)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
