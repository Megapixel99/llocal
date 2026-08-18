import { describe, it, expect } from 'vitest'
import {
  BASE_PROMPT,
  MODE_RULES,
  buildEnvironmentBlock,
  buildSystemPrompt,
  buildUserLayer,
  currentEnvironment
} from '../src/shared/prompt'

describe('base system prompt', () => {
  it('is always sent, even with nothing configured', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain(BASE_PROMPT)
    expect(prompt.trim().length).toBeGreaterThan(0)
  })

  it('adds no task rules for plain chat', () => {
    expect(buildSystemPrompt({ mode: 'chat' })).toBe(BASE_PROMPT)
  })

  it('layers the mode rules under the base prompt', () => {
    for (const mode of ['reason', 'research', 'agent'] as const) {
      const prompt = buildSystemPrompt({ mode })
      expect(prompt.startsWith(BASE_PROMPT)).toBe(true)
      expect(prompt).toContain(MODE_RULES[mode])
    }
  })

  it('keeps the reasoning contract the <think> renderer depends on', () => {
    expect(MODE_RULES.reason).toContain('<think>')
    expect(MODE_RULES.reason).toContain('</think>')
  })

  it('puts the user configuration last so it outranks the general guidance', () => {
    const user = buildUserLayer({ instructions: 'Call me Cap.' })
    const prompt = buildSystemPrompt({ mode: 'chat', model: 'qwen3:4b', user })
    expect(prompt.indexOf(BASE_PROMPT)).toBeLessThan(prompt.indexOf('Call me Cap.'))
    expect(prompt.trimEnd().endsWith('Call me Cap.')).toBe(true)
  })

  it('states the environment facts the weights cannot contain', () => {
    const prompt = buildSystemPrompt({
      date: '2026-08-17',
      platform: 'macOS',
      model: 'gemma4:e4b',
      workspace: '/Users/x/proj'
    })
    expect(prompt).toContain('2026-08-17')
    expect(prompt).toContain('macOS')
    expect(prompt).toContain('gemma4:e4b')
    expect(prompt).toContain('/Users/x/proj')
  })

  it('omits the environment block entirely when nothing is known', () => {
    expect(buildEnvironmentBlock({})).toBe('')
    expect(buildSystemPrompt({})).not.toContain('Environment:')
  })

  it('includes per-turn notes', () => {
    const prompt = buildSystemPrompt({ notes: ['The user attached "report.pdf".', ''] })
    expect(prompt).toContain('report.pdf')
  })
})

describe('user layer', () => {
  it('is empty when the user has configured nothing', () => {
    expect(buildUserLayer({})).toBe('')
    expect(buildUserLayer({ instructions: '  ', project: '', memory: undefined })).toBe('')
  })

  it('combines instructions, project and memory, and says they take precedence', () => {
    const layer = buildUserLayer({
      instructions: 'Prefer TypeScript.',
      project: 'Project instructions:\nShip small PRs.',
      memory: 'Remembered: user runs Ollama locally.'
    })
    expect(layer).toContain('Prefer TypeScript.')
    expect(layer).toContain('Ship small PRs.')
    expect(layer).toContain('Remembered: user runs Ollama locally.')
    expect(layer).toMatch(/outranks/i)
  })

  it('keeps the order instructions → project → memory', () => {
    const layer = buildUserLayer({ instructions: 'AAA', project: 'BBB', memory: 'CCC' })
    expect(layer.indexOf('AAA')).toBeLessThan(layer.indexOf('BBB'))
    expect(layer.indexOf('BBB')).toBeLessThan(layer.indexOf('CCC'))
  })
})

describe('currentEnvironment', () => {
  it('returns an ISO date and never throws without a navigator', () => {
    const env = currentEnvironment()
    expect(env.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof env.platform).toBe('string')
  })
})
