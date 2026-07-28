import { describe, it, expect } from 'vitest'
import { artifactFilename } from '../src/renderer/src/utils/artifact'

describe('artifactFilename', () => {
  it('maps known languages to their extension', () => {
    expect(artifactFilename('html artifact', 'html')).toBe('html-artifact.html')
    expect(artifactFilename('Diagram', 'mermaid')).toBe('diagram.mmd')
    expect(artifactFilename('script', 'javascript')).toBe('script.js')
  })

  it('falls back to .txt for unknown languages', () => {
    expect(artifactFilename('notes', 'brainfuck')).toBe('notes.txt')
  })

  it('slugifies the title and never yields an empty base name', () => {
    expect(artifactFilename('My Cool Page!!', 'html')).toBe('my-cool-page.html')
    expect(artifactFilename('', 'css')).toBe('artifact.css')
    expect(artifactFilename('***', 'css')).toBe('artifact.css')
  })
})
