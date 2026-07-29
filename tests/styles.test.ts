import { describe, it, expect } from 'vitest'
import { buildSystemInstructions, styleById, RESPONSE_STYLES } from '../src/shared/styles'

describe('styles / custom instructions', () => {
  it('returns empty when nothing is set (normal style, no instructions)', () => {
    expect(buildSystemInstructions('', 'normal')).toBe('')
    expect(buildSystemInstructions('   ', 'normal')).toBe('')
  })

  it('uses custom instructions alone under the normal style', () => {
    expect(buildSystemInstructions('Call me Cap.', 'normal')).toBe('Call me Cap.')
  })

  it('uses the style directive alone when there are no instructions', () => {
    const out = buildSystemInstructions('', 'concise')
    expect(out).toBe(styleById('concise').directive)
    expect(out.length).toBeGreaterThan(0)
  })

  it('combines instructions + style directive, instructions first', () => {
    const out = buildSystemInstructions('Prefer TypeScript.', 'formal')
    expect(out.startsWith('Prefer TypeScript.')).toBe(true)
    expect(out).toContain(styleById('formal').directive)
  })

  it('falls back to normal for an unknown style id', () => {
    expect(styleById('bogus').id).toBe('normal')
    expect(buildSystemInstructions('hi', 'bogus')).toBe('hi')
  })

  it('every non-normal style has a directive; normal has none', () => {
    for (const s of RESPONSE_STYLES) {
      if (s.id === 'normal') expect(s.directive).toBe('')
      else expect(s.directive.length).toBeGreaterThan(0)
    }
  })
})
