import { describe, it, expect } from 'vitest'
import {
  CATALOG,
  searchCatalog,
  filterByTags,
  sortCatalog,
  collectTags,
  normalizeLibrary,
  parseLibraryHtml,
  type CatalogModel
} from '../src/shared/model-catalogue'

/** Build a CatalogModel with sensible defaults so tests only specify what matters. */
function model(partial: Partial<CatalogModel> & { name: string }): CatalogModel {
  return {
    family: 'x',
    description: '',
    params: [],
    sizes: [],
    tags: [],
    ...partial
  }
}

describe('CATALOG (static offline fallback)', () => {
  it('is non-empty and reasonably sized', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(20)
  })

  it('has well-formed entries (unique names, required fields, string arrays)', () => {
    const names = new Set<string>()
    for (const m of CATALOG) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(names.has(m.name)).toBe(false)
      names.add(m.name)
      expect(typeof m.family).toBe('string')
      expect(typeof m.description).toBe('string')
      expect(Array.isArray(m.params)).toBe(true)
      expect(Array.isArray(m.sizes)).toBe(true)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(m.tags.every((t) => typeof t === 'string')).toBe(true)
    }
  })

  it('includes the models LLocal relies on', () => {
    const names = CATALOG.map((m) => m.name)
    for (const required of ['all-minilm', 'moondream', 'llama3.2', 'nomic-embed-text']) {
      expect(names).toContain(required)
    }
  })
})

describe('searchCatalog', () => {
  const catalog = [
    model({ name: 'llama3.2', description: 'general purpose', tags: ['tools'] }),
    model({ name: 'llava', description: 'a Vision model', tags: ['vision'] }),
    model({ name: 'nomic-embed-text', description: 'embeddings', tags: ['embedding'] })
  ]

  it('returns a copy of everything for an empty query', () => {
    const result = searchCatalog(catalog, '')
    expect(result).toHaveLength(3)
    expect(result).not.toBe(catalog)
  })

  it('matches on name', () => {
    expect(searchCatalog(catalog, 'llama').map((m) => m.name)).toEqual(['llama3.2'])
  })

  it('matches on description (case-insensitive)', () => {
    expect(searchCatalog(catalog, 'VISION').map((m) => m.name)).toEqual(['llava'])
  })

  it('matches on a tag', () => {
    expect(searchCatalog(catalog, 'embedding').map((m) => m.name)).toEqual(['nomic-embed-text'])
  })

  it('returns nothing for a non-match', () => {
    expect(searchCatalog(catalog, 'zzzz')).toHaveLength(0)
  })
})

describe('filterByTags', () => {
  const catalog = [
    model({ name: 'a', tags: ['code', 'small'] }),
    model({ name: 'b', tags: ['code'] }),
    model({ name: 'c', tags: ['vision', 'small'] })
  ]

  it('returns a copy of everything for no tags', () => {
    const result = filterByTags(catalog, [])
    expect(result).toHaveLength(3)
    expect(result).not.toBe(catalog)
  })

  it('uses AND semantics across multiple tags', () => {
    expect(filterByTags(catalog, ['code', 'small']).map((m) => m.name)).toEqual(['a'])
  })

  it('matches a single tag against all owners', () => {
    expect(filterByTags(catalog, ['small']).map((m) => m.name)).toEqual(['a', 'c'])
  })

  it('is case-insensitive', () => {
    expect(filterByTags(catalog, ['CODE']).map((m) => m.name)).toEqual(['a', 'b'])
  })
})

describe('sortCatalog', () => {
  const catalog = [
    model({ name: 'beta', pulls: 100 }),
    model({ name: 'alpha', pulls: 300 }),
    model({ name: 'gamma' })
  ]

  it('sorts by name A→Z without mutating the input', () => {
    const result = sortCatalog(catalog, 'name')
    expect(result.map((m) => m.name)).toEqual(['alpha', 'beta', 'gamma'])
    expect(catalog[0].name).toBe('beta')
  })

  it('sorts by popularity (descending pulls, unknown as 0)', () => {
    expect(sortCatalog(catalog, 'popularity').map((m) => m.name)).toEqual([
      'alpha',
      'beta',
      'gamma'
    ])
  })

  it('breaks popularity ties by name', () => {
    const tied = [model({ name: 'z', pulls: 5 }), model({ name: 'a', pulls: 5 })]
    expect(sortCatalog(tied, 'popularity').map((m) => m.name)).toEqual(['a', 'z'])
  })
})

describe('collectTags', () => {
  it('returns the distinct tags sorted', () => {
    const catalog = [
      model({ name: 'a', tags: ['code', 'small'] }),
      model({ name: 'b', tags: ['small', 'vision'] })
    ]
    expect(collectTags(catalog)).toEqual(['code', 'small', 'vision'])
  })
})

describe('normalizeLibrary', () => {
  it('normalizes a valid array of models', () => {
    const models = normalizeLibrary([
      { name: 'llama3.2', family: 'llama', description: 'hi', sizes: ['1b', '3b'], tags: ['tools'] }
    ])
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      name: 'llama3.2',
      family: 'llama',
      sizes: ['1b', '3b'],
      tags: ['tools']
    })
  })

  it('accepts an object with a models array and derives missing family/params', () => {
    const models = normalizeLibrary({
      models: [{ name: 'qwen2.5-coder', capabilities: ['code'], parameters: ['7b'] }]
    })
    expect(models).toHaveLength(1)
    expect(models[0].family).toBe('qwen2')
    expect(models[0].tags).toEqual(['code'])
    expect(models[0].params).toEqual(['7b'])
  })

  it('reads pull_count into pulls', () => {
    const models = normalizeLibrary([{ name: 'x', pull_count: 42 }])
    expect(models[0].pulls).toBe(42)
  })

  it('skips entries without a usable name', () => {
    const models = normalizeLibrary([{ description: 'no name' }, { name: '' }, { name: 'ok' }])
    expect(models.map((m) => m.name)).toEqual(['ok'])
  })

  it('returns [] (never throws) on garbage input', () => {
    expect(normalizeLibrary(null)).toEqual([])
    expect(normalizeLibrary(undefined)).toEqual([])
    expect(normalizeLibrary(42)).toEqual([])
    expect(normalizeLibrary('nope')).toEqual([])
    expect(normalizeLibrary({})).toEqual([])
    expect(normalizeLibrary({ models: 'not-an-array' })).toEqual([])
  })
})

describe('parseLibraryHtml', () => {
  it('extracts model names and descriptions from library anchors', () => {
    const html = `
      <ul>
        <li><a href="/library/llama3.2"><span>llama3.2</span><p>Small models with tools</p></a></li>
        <li><a href="/library/llava"><span>llava</span><p>A vision model</p></a></li>
      </ul>`
    const models = parseLibraryHtml(html)
    expect(models.map((m) => m.name)).toEqual(['llama3.2', 'llava'])
    expect(models[1].tags).toContain('vision')
  })

  it('deduplicates repeated library links', () => {
    const html =
      '<a href="/library/mistral">mistral</a><a href="/library/mistral">mistral again</a>'
    expect(parseLibraryHtml(html).map((m) => m.name)).toEqual(['mistral'])
  })

  it('returns [] (never throws) on unusable input', () => {
    expect(parseLibraryHtml('')).toEqual([])
    expect(parseLibraryHtml('<html>no library links here</html>')).toEqual([])
    // @ts-expect-error deliberately wrong type
    expect(parseLibraryHtml(null)).toEqual([])
  })
})
