import { describe, it, expect } from 'vitest'
import { findUrls } from '../src/renderer/src/utils/utils'

/**
 * findUrls was relocated to utils.ts so the plain-chat web-search path and the DeepResearch agent share
 * one implementation. These guard the extraction it relies on (detecting links to scrape in a prompt).
 */
describe('findUrls', () => {
  it('extracts an http(s) URL from a sentence', () => {
    expect(findUrls('see https://example.com/page for details')).toEqual([
      'https://example.com/page'
    ])
  })

  it('extracts multiple URLs', () => {
    const urls = findUrls('compare http://a.com and https://b.org/x')
    expect(urls).toContain('http://a.com')
    expect(urls).toContain('https://b.org/x')
    expect(urls).toHaveLength(2)
  })

  it('detects bare www / domain-style links', () => {
    expect(findUrls('go to www.example.com now')).toEqual(['www.example.com'])
  })

  it('returns an empty array when there are no links', () => {
    expect(findUrls('just a normal question with no links')).toEqual([])
  })
})
