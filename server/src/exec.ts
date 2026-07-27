/**
 * Command execution route — lets the app run commands (unzip, build steps, git
 * housekeeping, …) ON THE HOST so code work never touches the phone.
 *
 * This is powerful and dangerous, so it is OFF unless LLOCAL_ENABLE_EXEC=1, is
 * behind the bearer token, supports an optional command allowlist, and always
 * runs inside a bounded working directory. See server/README.md.
 */
import { Router } from 'express'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { config } from './config.ts'

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

function resolveCwd(owner?: string, repo?: string): string {
  if (owner && repo) {
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
      throw new Error('Invalid owner/repo')
    }
    return path.join(config.reposDir, `${owner}__${repo}`)
  }
  return config.dataDir
}

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? ''
}

export const execRouter = Router()

execRouter.post('/', (req, res) => {
  if (!config.execEnabled) {
    return res.status(403).json({ error: 'Command execution is disabled (set LLOCAL_ENABLE_EXEC=1).' })
  }
  try {
    const { command, owner, repo } = req.body as {
      command: string
      owner?: string
      repo?: string
    }
    if (!command || !command.trim()) return res.status(400).json({ error: 'Missing command' })

    if (config.execAllowlist.length > 0) {
      const cmd = firstToken(command)
      if (!config.execAllowlist.includes(cmd)) {
        return res
          .status(403)
          .json({ error: `Command "${cmd}" is not in the allowlist (${config.execAllowlist.join(', ')}).` })
      }
    }

    const cwd = resolveCwd(owner, repo)
    fs.mkdirSync(cwd, { recursive: true })

    exec(
      command,
      { cwd, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        res.json({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          code: error && typeof (error as { code?: number }).code === 'number'
            ? (error as { code?: number }).code
            : error
              ? 1
              : 0
        })
      }
    )
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
