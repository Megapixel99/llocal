import { describe, it, expect } from 'vitest'
import { parseRememberCommand, buildMemoryBlock } from '../src/shared/memory'

describe('parseRememberCommand', () => {
  it('captures "remember that X"', () => {
    expect(parseRememberCommand('Remember that I prefer TypeScript')).toBe('I prefer TypeScript')
  })
  it('captures "remember to X" and bare "remember X"', () => {
    expect(parseRememberCommand('remember to call me Cap')).toBe('call me Cap')
    expect(parseRememberCommand('Remember: my timezone is PT')).toBe('my timezone is PT')
    expect(parseRememberCommand('remember I use pnpm')).toBe('I use pnpm')
  })
  it('ignores messages that only mention remember incidentally', () => {
    expect(parseRememberCommand('do you remember when we fixed the bug?')).toBeNull()
    expect(parseRememberCommand('remember')).toBeNull()
    expect(parseRememberCommand('what should I remember')).toBeNull()
  })
})

describe('buildMemoryBlock', () => {
  it('returns empty for no memories', () => {
    expect(buildMemoryBlock([])).toBe('')
    expect(buildMemoryBlock(['  ', ''])).toBe('')
  })
  it('renders a deduped bullet block', () => {
    const out = buildMemoryBlock(['I use pnpm', 'I use pnpm', 'Call me Cap'])
    expect(out).toContain('- I use pnpm')
    expect(out).toContain('- Call me Cap')
    expect(out.match(/- I use pnpm/g)?.length).toBe(1)
  })
})
