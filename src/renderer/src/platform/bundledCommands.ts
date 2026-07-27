/**
 * The example slash commands bundled with the app (resources/commands/**).
 *
 * On desktop the Electron main process scans the disk for commands. Mobile/web
 * has no filesystem and the companion server may be older or absent, so we bundle
 * the same example command files into the web build (via Vite's glob import) and
 * parse them with the shared, filesystem-free parser. This is used as a fallback
 * in httpApi.listCommands so the slash-command palette isn't empty on mobile.
 */
import { parseCommandFile, commandNameFromRelPath, type Command } from '../../../shared/commands'

// Eagerly inline the raw markdown of every bundled command at build time.
const files = import.meta.glob('../../../../resources/commands/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

let cache: Command[] | null = null

export function bundledCommands(): Command[] {
  if (cache) return cache
  const marker = 'resources/commands/'
  cache = Object.entries(files)
    .map(([path, raw]) => {
      const rel = path.slice(path.indexOf(marker) + marker.length)
      const { name, namespace } = commandNameFromRelPath(rel)
      const parsed = parseCommandFile(raw)
      return {
        name,
        namespace,
        description: parsed.description || name,
        argumentHint: parsed.argumentHint,
        model: parsed.model,
        allowedTools: parsed.allowedTools,
        body: parsed.body,
        source: `bundled:${rel}`
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return cache
}
