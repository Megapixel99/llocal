import { describe, it, expect } from 'vitest'
import { bundledCommands } from '../src/renderer/src/platform/bundledCommands'

/**
 * The mobile/web build has no filesystem, so the slash-command palette relies on the example
 * commands being bundled in (via Vite glob) and parsed with the shared parser. Guard that the
 * bundle is non-empty and namespaced folders map to `ns:name` ids, so mobile isn't left with an
 * empty command palette again.
 */
describe('bundledCommands', () => {
  const cmds = bundledCommands()

  it('includes the root-level example command', () => {
    expect(cmds.map((c) => c.name)).toContain('summarize')
    expect(cmds.find((c) => c.name === 'summarize')?.description.length).toBeGreaterThan(0)
  })

  it('namespaces sub-folder commands as ns:name', () => {
    const names = cmds.map((c) => c.name)
    expect(names).toContain('tools:security-scan')
    expect(names).toContain('tools:explain-code')
    expect(names).toContain('workflows:feature-development')
    expect(cmds.find((c) => c.name === 'tools:security-scan')?.namespace).toBe('tools')
  })

  it('strips frontmatter from the template body', () => {
    for (const c of cmds) expect(c.body.startsWith('---')).toBe(false)
  })
})
