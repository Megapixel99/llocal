import { describe, it, expect } from 'vitest'
import {
  firstToken,
  isCommandAllowed,
  isShellLanguage,
  parseAllowlist
} from '../src/shared/exec-policy'

describe('exec-policy', () => {
  it('firstToken extracts the program', () => {
    expect(firstToken('  git   status ')).toBe('git')
    expect(firstToken('ls')).toBe('ls')
    expect(firstToken('')).toBe('')
  })

  it('empty allowlist permits nothing (safe default)', () => {
    expect(isCommandAllowed('ls', [])).toBe(false)
    expect(isCommandAllowed('rm -rf /', [])).toBe(false)
    expect(isCommandAllowed('ls', ['   '])).toBe(false) // blank entries don't count
  })

  it('allows an exact first-token match only', () => {
    expect(isCommandAllowed('git status', ['git', 'ls'])).toBe(true)
    expect(isCommandAllowed('rm -rf /', ['git', 'ls'])).toBe(false)
  })

  it('matches an absolute path by basename', () => {
    expect(isCommandAllowed('/usr/bin/git push', ['git'])).toBe(true)
    expect(isCommandAllowed('/opt/homebrew/bin/rg foo', ['rg'])).toBe(true)
    expect(isCommandAllowed('/usr/bin/rm x', ['git'])).toBe(false)
  })

  it('never allows a blank command', () => {
    expect(isCommandAllowed('   ', ['git'])).toBe(false)
  })

  it('recognizes shell languages case-insensitively', () => {
    for (const l of ['bash', 'sh', 'shell', 'zsh', 'console', 'BASH']) {
      expect(isShellLanguage(l)).toBe(true)
    }
    for (const l of ['python', 'js', 'ts', '', undefined, null]) {
      expect(isShellLanguage(l as string)).toBe(false)
    }
  })

  it('parses a comma/newline allowlist field', () => {
    expect(parseAllowlist('git, ls\nrg,  , npm')).toEqual(['git', 'ls', 'rg', 'npm'])
    expect(parseAllowlist('')).toEqual([])
  })
})
