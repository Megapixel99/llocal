/**
 * Renderer-side access to the shared command core.
 *
 * The parsing/expansion logic lives in src/shared/commands.ts (no Electron or
 * filesystem dependency) so it can be reused verbatim here. Commands are loaded
 * over the bridge via `window.api.listCommands()`; the renderer only needs to
 * expand the chosen template before sending it to the model.
 */
import { expandCommand } from '../../../shared/commands'
import type { Command } from '../../../shared/commands'

export { expandCommand }
export type { Command }

/**
 * If `raw` starts with a known command invocation (`/name possibly args`),
 * expand it against that command's template. Otherwise return `raw` unchanged
 * so ordinary prompts (and unknown `/whatever`) pass straight through.
 */
export function maybeExpandCommand(raw: string, commands: Command[]): string {
  const match = raw.match(/^\/(\S+)\s*([\s\S]*)$/)
  if (!match) return raw
  const [, name, rest] = match
  const cmd = commands.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (!cmd) return raw
  return expandCommand(cmd.body, rest)
}

/** Commands whose name/description match the text typed after the leading `/`. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.toLowerCase()
  if (!q) return commands
  return commands.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  )
}
