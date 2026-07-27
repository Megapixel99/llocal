import { describe, it, expect } from 'vitest'
import {
  normalizePreviewLanguage,
  isPreviewableLanguage,
  buildPreviewDocument
} from '../src/renderer/src/utils/preview'

describe('normalizePreviewLanguage', () => {
  it('maps HTML-ish languages to "html"', () => {
    expect(normalizePreviewLanguage('html')).toBe('html')
    expect(normalizePreviewLanguage('htm')).toBe('html')
    expect(normalizePreviewLanguage('xhtml')).toBe('html')
  })

  it('maps JavaScript variants to "javascript"', () => {
    expect(normalizePreviewLanguage('javascript')).toBe('javascript')
    expect(normalizePreviewLanguage('js')).toBe('javascript')
    expect(normalizePreviewLanguage('mjs')).toBe('javascript')
    expect(normalizePreviewLanguage('cjs')).toBe('javascript')
  })

  it('maps css and svg to themselves', () => {
    expect(normalizePreviewLanguage('css')).toBe('css')
    expect(normalizePreviewLanguage('svg')).toBe('svg')
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizePreviewLanguage('HTML')).toBe('html')
    expect(normalizePreviewLanguage('  JavaScript  ')).toBe('javascript')
    expect(normalizePreviewLanguage('Css')).toBe('css')
  })

  it('returns null for non-previewable or missing languages', () => {
    expect(normalizePreviewLanguage('python')).toBeNull()
    expect(normalizePreviewLanguage('mermaid')).toBeNull()
    expect(normalizePreviewLanguage('')).toBeNull()
    expect(normalizePreviewLanguage(undefined)).toBeNull()
  })
})

describe('isPreviewableLanguage', () => {
  it('is true for supported languages and false otherwise', () => {
    expect(isPreviewableLanguage('html')).toBe(true)
    expect(isPreviewableLanguage('js')).toBe(true)
    expect(isPreviewableLanguage('css')).toBe(true)
    expect(isPreviewableLanguage('svg')).toBe(true)
    expect(isPreviewableLanguage('typescript')).toBe(false)
    expect(isPreviewableLanguage('mermaid')).toBe(false)
    expect(isPreviewableLanguage(undefined)).toBe(false)
  })
})

describe('buildPreviewDocument', () => {
  it('returns null for unsupported / missing languages', () => {
    expect(buildPreviewDocument('python', 'print(1)')).toBeNull()
    expect(buildPreviewDocument('mermaid', 'graph TD;')).toBeNull()
    expect(buildPreviewDocument(undefined, '<h1>hi</h1>')).toBeNull()
  })

  it('always injects the console/error relay so output reaches the app', () => {
    for (const lang of ['html', 'css', 'svg', 'js']) {
      const doc = buildPreviewDocument(lang, 'x')!
      expect(doc).toContain('llocal-preview-console')
      expect(doc).toContain("addEventListener('error'")
      expect(doc).toContain("addEventListener('unhandledrejection'")
    }
  })

  describe('html', () => {
    it('wraps a bare fragment in a full document containing the code', () => {
      const doc = buildPreviewDocument('html', '<h1>Hi there</h1>')!
      expect(doc).toContain('<!doctype html>')
      expect(doc).toContain('<meta name="viewport"')
      expect(doc).toContain('<h1>Hi there</h1>')
      // A fragment must not accidentally produce two document shells.
      expect(doc.match(/<!doctype html>/gi)?.length).toBe(1)
    })

    it('passes a full document through without re-wrapping it', () => {
      const full = '<!DOCTYPE html><html><head></head><body><p>real page</p></body></html>'
      const doc = buildPreviewDocument('html', full)!
      expect(doc).toContain('<p>real page</p>')
      // No wrapper scaffolding was added around the user's own document.
      expect(doc).not.toContain('<meta name="viewport"')
      // Exactly the one doctype the author already wrote.
      expect(doc.match(/<!doctype html>/gi)?.length).toBe(1)
    })

    it('injects the relay just inside <head> when one is present', () => {
      const full = '<!doctype html><html><head><title>t</title></head><body></body></html>'
      const doc = buildPreviewDocument('html', full)!
      expect(doc).toContain('<head><script>')
      // relay comes before the author's own <title>
      expect(doc.indexOf('llocal-preview-console')).toBeLessThan(doc.indexOf('<title>'))
    })

    it('injects the relay after <html> when there is no head', () => {
      const doc = buildPreviewDocument('html', '<html><body>x</body></html>')!
      expect(doc.indexOf('llocal-preview-console')).toBeLessThan(doc.indexOf('<body>'))
    })
  })

  describe('css', () => {
    it('applies the CSS to a representative sample of markup', () => {
      const doc = buildPreviewDocument('css', 'h1 { color: hotpink }')!
      expect(doc).toContain('h1 { color: hotpink }')
      expect(doc).toContain('Heading level 1')
      expect(doc).toContain('class="card"')
      expect(doc).toContain('<button')
    })
  })

  describe('javascript', () => {
    it('runs the user code inside a guarded script with an app root', () => {
      const doc = buildPreviewDocument('js', 'console.log(41 + 1)')!
      expect(doc).toContain('<div id="app"></div>')
      expect(doc).toContain('console.log(41 + 1)')
      expect(doc).toContain('try {')
      expect(doc).toContain('} catch (error) {')
    })
  })

  describe('svg', () => {
    it('embeds the SVG markup and centers it', () => {
      const doc = buildPreviewDocument('svg', '<svg><circle r="5" /></svg>')!
      expect(doc).toContain('<svg><circle r="5" /></svg>')
      expect(doc).toContain('align-items: center')
    })
  })
})
