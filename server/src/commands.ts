/**
 * Slash-command routes.
 *
 * Reuses the shared command core (src/shared/commands.ts) to expose the Claude
 * Code style commands installed on the host machine (e.g. wshobson/commands in
 * ~/.claude/commands, or a `commands` folder in the server data dir) so the
 * mobile client gets the same command list as the desktop app.
 */
import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { config } from './config.ts'
import {
  type Command,
  commandNameFromRelPath,
  dedupeCommands,
  parseCommandFile
} from '../../src/shared/commands.ts'

export const commandsRouter = Router()

function walkMarkdown(dir: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkMarkdown(full))
    else if (entry.isFile() && /\.md$/i.test(entry.name) && entry.name.toLowerCase() !== 'readme.md')
      files.push(full)
  }
  return files
}

function loadFromDir(root: string): Command[] {
  const commands: Command[] = []
  for (const file of walkMarkdown(root)) {
    try {
      const parsed = parseCommandFile(fs.readFileSync(file, 'utf-8'))
      const { name, namespace } = commandNameFromRelPath(path.relative(root, file))
      if (!name) continue
      commands.push({
        name,
        namespace,
        description: parsed.description || name,
        argumentHint: parsed.argumentHint,
        model: parsed.model,
        allowedTools: parsed.allowedTools,
        body: parsed.body,
        source: file
      })
    } catch {
      /* skip malformed files */
    }
  }
  return commands
}

commandsRouter.get('/list', (_req, res) => {
  try {
    const roots = [
      path.join(os.homedir(), '.claude', 'commands'),
      path.join(config.dataDir, 'commands')
    ]
    res.json(dedupeCommands(roots.map((r) => loadFromDir(r))))
  } catch {
    res.json([])
  }
})
