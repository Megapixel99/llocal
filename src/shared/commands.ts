/**
 * Platform-agnostic "slash command" core.
 *
 * LLocal supports Claude Code style commands — the same markdown files used by
 * projects like https://github.com/wshobson/commands. A command is just a
 * markdown file whose name becomes the command name and whose body is a prompt
 * template. Sub-folders act as namespaces (Claude's convention), so a file at
 * `tools/api-scaffold.md` is invoked as `/tools:api-scaffold`.
 *
 * This module has NO filesystem or Electron dependency — it only parses raw
 * file text and expands templates. That way it is shared by:
 *   - the Electron main process (src/main/utils/commands.ts scans the disk), and
 *   - the renderer (expands the chosen command locally before sending it), and
 *   - the companion server (server/src/commands.ts scans the host).
 * mirroring how src/shared/rag-core.ts is shared for RAG.
 */

export interface Command {
  /** Full invocation id, e.g. "review" or "tools:api-scaffold". */
  name: string
  /** Namespace derived from the containing folder(s), e.g. "tools". '' for root. */
  namespace: string
  /** Human readable summary from frontmatter `description` (falls back to the name). */
  description: string
  /** Frontmatter `argument-hint`, shown to the user, e.g. "[feature description]". */
  argumentHint: string
  /** Frontmatter `model` override, if the command specifies one. */
  model: string
  /** Frontmatter `allowed-tools`, kept for display / future gating. */
  allowedTools: string
  /** The prompt template (frontmatter stripped). */
  body: string
  /** Where the command was loaded from (absolute path); informational. */
  source: string
}

export interface ParsedCommandFile {
  description: string
  argumentHint: string
  model: string
  allowedTools: string
  body: string
}

/**
 * Split a markdown command file into its YAML-ish frontmatter fields and body.
 *
 * Only the handful of keys Claude Code understands are read, with a minimal
 * `key: value` parser (values may be quoted). Anything else in the frontmatter
 * is ignored. A file without frontmatter is treated as an all-body template.
 */
export function parseCommandFile(raw: string): ParsedCommandFile {
  const normalized = raw.replace(/\r\n/g, '\n')
  const result: ParsedCommandFile = {
    description: '',
    argumentHint: '',
    model: '',
    allowedTools: '',
    body: normalized.trim()
  }

  // Frontmatter must be the very first thing in the file.
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return result

  const [, front, body] = match
  result.body = body.trim()

  for (const line of front.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    let value = line.slice(idx + 1).trim()
    // Strip surrounding quotes.
    value = value.replace(/^["']/, '').replace(/["']$/, '').trim()
    switch (key) {
      case 'description':
        result.description = value
        break
      case 'argument-hint':
      case 'argument_hint':
        result.argumentHint = value
        break
      case 'model':
        result.model = value
        break
      case 'allowed-tools':
      case 'allowed_tools':
        result.allowedTools = value
        break
    }
  }
  return result
}

/**
 * Turn a file path (relative to a commands root) into an invocation id.
 *
 *   "review.md"              -> { name: "review",             namespace: "" }
 *   "tools/api-scaffold.md"  -> { name: "tools:api-scaffold", namespace: "tools" }
 *   "a/b/c.md"               -> { name: "a:b:c",              namespace: "a:b" }
 */
export function commandNameFromRelPath(relPath: string): { name: string; namespace: string } {
  const parts = relPath
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .split('/')
    .filter(Boolean)
  const namespace = parts.slice(0, -1).join(':')
  const name = parts.join(':')
  return { name, namespace }
}

/**
 * Expand a command template against the user-supplied argument string.
 *
 * Substitutions (matching Claude Code's command semantics):
 *   - `$ARGUMENTS`        -> the full argument string
 *   - `$1`, `$2`, … `$9`  -> individual whitespace-separated arguments
 *
 * If the template references none of those placeholders and the user supplied
 * arguments anyway, the arguments are appended so nothing the user typed is
 * silently dropped.
 */
export function expandCommand(body: string, args: string): string {
  const trimmedArgs = args.trim()
  const hasArgumentsToken = /\$ARGUMENTS\b/.test(body)
  const hasPositional = /\$[1-9]\b/.test(body)

  let out = body.replace(/\$ARGUMENTS\b/g, trimmedArgs)

  if (hasPositional) {
    const positional = trimmedArgs.length ? trimmedArgs.split(/\s+/) : []
    out = out.replace(/\$([1-9])\b/g, (_m, d) => positional[Number(d) - 1] ?? '')
  }

  if (!hasArgumentsToken && !hasPositional && trimmedArgs.length) {
    out = `${out.trim()}\n\n${trimmedArgs}`
  }

  return out.trim()
}

/** Merge command lists by id, keeping the FIRST occurrence (highest priority). */
export function dedupeCommands(lists: Command[][]): Command[] {
  const byName = new Map<string, Command>()
  for (const list of lists) {
    for (const cmd of list) {
      if (!byName.has(cmd.name)) byName.set(cmd.name, cmd)
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}
