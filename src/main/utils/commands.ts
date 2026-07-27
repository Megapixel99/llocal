/**
 * Desktop (Electron main process) command loader.
 *
 * Discovers Claude Code style command files on disk and turns them into
 * {@link Command} objects using the shared, filesystem-free core
 * (src/shared/commands.ts). Commands are read from, in priority order:
 *
 *   1. ~/.claude/commands            — the standard Claude Code location, where
 *                                      collections like wshobson/commands are
 *                                      installed. These win on name conflicts.
 *   2. <LLocal data>/commands        — a per-user LLocal folder for custom
 *                                      commands, created on first load.
 *   3. <app>/resources/commands      — a few examples bundled with the app so
 *                                      the feature works out of the box.
 *
 * A command file is any `*.md` file; sub-folders become `:`-separated
 * namespaces (so `tools/api-scaffold.md` -> `/tools:api-scaffold`).
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import {
  Command,
  commandNameFromRelPath,
  dedupeCommands,
  parseCommandFile
} from '../../shared/commands'
import { createPath } from './utils'

/** Recursively collect every `*.md` file under `dir` (returns [] if missing). */
function walkMarkdown(dir: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    // Skip hidden files/folders and README-style docs.
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(full))
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      if (entry.name.toLowerCase() === 'readme.md') continue
      files.push(full)
    }
  }
  return files
}

/** Load every command in a single root directory. */
function loadCommandsFromDir(root: string): Command[] {
  const files = walkMarkdown(root)
  const commands: Command[] = []
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed = parseCommandFile(raw)
      const relPath = path.relative(root, file)
      const { name, namespace } = commandNameFromRelPath(relPath)
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
      // Skip unreadable / malformed files rather than failing the whole load.
    }
  }
  return commands
}

/** The user-writable LLocal commands directory (created on demand). */
export function llocalCommandsDir(): string {
  return createPath('commands')
}

/** Directories scanned for commands, highest priority first. */
function commandRoots(): string[] {
  const roots = [
    path.join(os.homedir(), '.claude', 'commands'),
    llocalCommandsDir(),
    path.join(app.getAppPath(), 'resources', 'commands')
  ]
  // Ensure the user-writable dir exists so people have somewhere to drop files.
  try {
    fs.mkdirSync(llocalCommandsDir(), { recursive: true })
  } catch {
    /* best effort */
  }
  return roots
}

/**
 * Discover and return all available commands, de-duplicated by name (earlier
 * roots win). Never throws — a broken directory just contributes nothing.
 */
export function listCommands(): Command[] {
  const lists = commandRoots().map((root) => loadCommandsFromDir(root))
  return dedupeCommands(lists)
}
