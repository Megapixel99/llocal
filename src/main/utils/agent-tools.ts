import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { isSensitivePath } from '../../shared/notifications'
import { showNotification } from './notifier'

const pexec = promisify(exec)

const MAX_FILE_BYTES = 100_000 // cap file reads so we don't blow up the context
const MAX_OUTPUT_CHARS = 20_000 // cap command / search output
const IGNORED = new Set(['node_modules', '.git', 'dist', 'out', '.next', 'build'])

// Tool definitions handed to the model (Ollama function-calling schema).
export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file relative to the working folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path relative to the working folder' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List the entries of a directory relative to the working folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path (default ".")' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search file contents (case-insensitive substring) under the working folder.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a text file relative to the working folder. Requires approval.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the working folder. Requires approval.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      }
    }
  }
] as const

// Tools that mutate state / execute code — the renderer must get user approval before calling these.
export const MUTATING_TOOLS = new Set(['write_file', 'run_command'])

// Resolves a relative path and guarantees it stays inside the working folder (blocks ../ escapes).
function resolveInside(root: string, rel: string): string {
  const normRoot = path.resolve(root)
  const abs = path.resolve(normRoot, rel || '.')
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error('Path escapes the working folder')
  }
  return abs
}

function clip(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + '\n…[truncated]' : text
}

async function searchText(root: string, query: string): Promise<string> {
  const needle = query.toLowerCase()
  const matches: string[] = []
  const walk = (dir: string): void => {
    if (matches.length >= 100) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        try {
          if (fs.statSync(full).size > MAX_FILE_BYTES) continue
          const lines = fs.readFileSync(full, 'utf-8').split('\n')
          lines.forEach((line, i) => {
            if (matches.length < 100 && line.toLowerCase().includes(needle)) {
              matches.push(`${path.relative(root, full)}:${i + 1}: ${line.trim()}`)
            }
          })
        } catch {
          /* binary / unreadable — skip */
        }
      }
    }
  }
  walk(path.resolve(root))
  return matches.length ? clip(matches.join('\n')) : 'No matches found.'
}

// Executes a single tool call and returns a string result to feed back to the model.
export async function runAgentTool(
  root: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!root) throw new Error('No working folder is set')
  switch (name) {
    case 'read_file': {
      const rel = String(args.path ?? '')
      const abs = resolveInside(root, rel)
      // Opt-in heads-up when the agent touches secrets (respects the user's prefs).
      if (isSensitivePath(rel)) showNotification('sensitive-file-access', { path: rel })
      if (fs.statSync(abs).size > MAX_FILE_BYTES) return `File too large (> ${MAX_FILE_BYTES} bytes).`
      return clip(fs.readFileSync(abs, 'utf-8'))
    }
    case 'list_dir': {
      const abs = resolveInside(root, String(args.path ?? '.'))
      return fs
        .readdirSync(abs, { withFileTypes: true })
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n')
    }
    case 'search':
      return searchText(root, String(args.query ?? ''))
    case 'write_file': {
      const rel = String(args.path ?? '')
      const abs = resolveInside(root, rel)
      if (isSensitivePath(rel)) showNotification('sensitive-file-access', { path: rel })
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, String(args.content ?? ''), 'utf-8')
      return `Wrote ${rel}`
    }
    case 'run_command': {
      try {
        const { stdout, stderr } = await pexec(String(args.command ?? ''), {
          cwd: path.resolve(root),
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024
        })
        return clip(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim() || '(no output)')
      } catch (error) {
        const e = error as { stdout?: string; stderr?: string; message?: string }
        return clip(`Command failed:\n${e.stdout ?? ''}\n${e.stderr ?? e.message ?? ''}`.trim())
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
