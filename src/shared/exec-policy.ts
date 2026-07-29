/**
 * Pure policy helpers for the "run an LLM-generated command" feature.
 *
 * Executing model-generated commands is powerful and dangerous (a poisoned
 * context could emit a destructive command), so the feature is gated by:
 *   1. an explicit enable toggle (off by default),
 *   2. an allowlist of permitted command prefixes — an EMPTY allowlist permits
 *      NOTHING, so nothing runs until the user opts specific commands in, and
 *   3. per-command human approval at the call site.
 *
 * This module is pure string logic (no DOM/Electron/Node) like commands.ts and
 * pairing.ts, so it can be unit-tested and shared. The companion server enforces
 * its own allowlist independently for the phone→host path (defense in depth).
 */

/** The first whitespace-delimited token of a command (the program being run). */
export function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? ''
}

/**
 * Whether `command` is permitted by `allowlist`.
 *
 * Matching is on the first token (the program), by exact match OR by basename
 * (so an allowlisted `git` also permits `/usr/bin/git`). An empty/blank allowlist
 * permits nothing — the safe default. A blank command is never allowed.
 */
export function isCommandAllowed(command: string, allowlist: string[]): boolean {
  const tok = firstToken(command)
  if (!tok) return false
  const allowed = allowlist.map((a) => a.trim()).filter(Boolean)
  if (allowed.length === 0) return false
  const base = tok.split(/[/\\]/).pop() ?? tok
  return allowed.some((a) => a === tok || a === base)
}

/** Languages we treat as runnable shell commands (react-markdown's `language-*`). */
const SHELL_LANGUAGES = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'console',
  'shell-session',
  'shellscript',
  'terminal'
])

export function isShellLanguage(language: string | undefined | null): boolean {
  return !!language && SHELL_LANGUAGES.has(language.toLowerCase())
}

/** Parse a settings text field (comma- or newline-separated) into an allowlist. */
export function parseAllowlist(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
