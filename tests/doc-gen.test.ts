import { describe, it, expect } from 'vitest'
import {
  validateDocSpec,
  safeValidateDocSpec,
  parseModelJson,
  extractJsonBlock,
  normalizeSheet,
  normalizeXlsxSpec,
  extForKind,
  type XlsxSpec
} from '../src/shared/doc-gen'

describe('validateDocSpec', () => {
  it('accepts a valid docx spec', () => {
    const spec = validateDocSpec({
      kind: 'docx',
      title: 'Report',
      blocks: [
        { type: 'heading', level: 1, text: 'Intro' },
        { type: 'paragraph', text: 'Hello' },
        { type: 'list', ordered: true, items: ['a', 'b'] }
      ]
    })
    expect(spec.kind).toBe('docx')
  })

  it('accepts a valid pptx spec and defaults missing bullets to []', () => {
    const spec = validateDocSpec({
      kind: 'pptx',
      title: 'Deck',
      slides: [{ title: 'Slide 1' }]
    })
    expect(spec.kind).toBe('pptx')
    if (spec.kind === 'pptx') expect(spec.slides[0].bullets).toEqual([])
  })

  it('accepts a valid xlsx spec with mixed cell types', () => {
    const spec = validateDocSpec({
      kind: 'xlsx',
      title: 'Book',
      sheets: [{ name: 'S1', columns: ['a', 'b'], rows: [['x', 1], [true, null]] }]
    })
    expect(spec.kind).toBe('xlsx')
  })

  it('rejects an unknown kind', () => {
    expect(() => validateDocSpec({ kind: 'pdf', title: 't' })).toThrow()
  })

  it('rejects a docx spec with an invalid block type', () => {
    const bad = { kind: 'docx', title: 't', blocks: [{ type: 'image', src: 'x' }] }
    expect(safeValidateDocSpec(bad).success).toBe(false)
  })

  it('rejects a docx heading with an out-of-range level', () => {
    const bad = { kind: 'docx', title: 't', blocks: [{ type: 'heading', level: 9, text: 'x' }] }
    expect(safeValidateDocSpec(bad).success).toBe(false)
  })

  it('rejects a pptx spec missing a slide title', () => {
    const bad = { kind: 'pptx', title: 't', slides: [{ bullets: ['x'] }] }
    expect(safeValidateDocSpec(bad).success).toBe(false)
  })

  it('rejects an xlsx spec whose rows are not arrays', () => {
    const bad = { kind: 'xlsx', title: 't', sheets: [{ name: 's', rows: ['not-a-row'] }] }
    expect(safeValidateDocSpec(bad).success).toBe(false)
  })
})

describe('extractJsonBlock', () => {
  it('returns plain JSON unchanged', () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}')
  })

  it('extracts JSON from a fenced ```json block', () => {
    const raw = 'Here you go:\n```json\n{"a":1}\n```\nThanks!'
    expect(extractJsonBlock(raw)).toBe('{"a":1}')
  })

  it('ignores trailing junk after the object', () => {
    expect(extractJsonBlock('{"a":1} and some commentary')).toBe('{"a":1}')
  })

  it('is not fooled by brackets inside strings', () => {
    expect(extractJsonBlock('{"a":"}{"}')).toBe('{"a":"}{"}')
  })

  it('returns null when there is no JSON', () => {
    expect(extractJsonBlock('no json here')).toBeNull()
  })
})

describe('parseModelJson', () => {
  it('parses plain JSON into a validated spec', () => {
    const spec = parseModelJson('{"kind":"docx","title":"T","blocks":[]}')
    expect(spec.kind).toBe('docx')
  })

  it('parses a fenced ```json block with surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"kind":"pptx","title":"T","slides":[{"title":"A"}]}\n```'
    const spec = parseModelJson(raw)
    expect(spec.kind).toBe('pptx')
  })

  it('tolerates trailing junk after the JSON object', () => {
    const spec = parseModelJson('{"kind":"docx","title":"T","blocks":[]}\n\nHope that helps!')
    expect(spec.kind).toBe('docx')
  })

  it('throws on pure garbage with no JSON', () => {
    expect(() => parseModelJson('I cannot do that')).toThrow(/No JSON/)
  })

  it('throws on malformed JSON (balanced brackets, invalid syntax)', () => {
    expect(() => parseModelJson('{"kind": "docx", title: nope}')).toThrow(/valid JSON/)
  })

  it('throws when valid JSON does not match the schema', () => {
    expect(() => parseModelJson('{"kind":"docx"}')).toThrow(/did not match/)
  })
})

describe('normalizeSheet', () => {
  it('pads ragged rows to a rectangular grid using the widest row', () => {
    const sheet: XlsxSpec['sheets'][number] = {
      name: 'S',
      columns: ['a', 'b'],
      rows: [[1], [2, 3, 4]]
    }
    const out = normalizeSheet(sheet)
    expect(out.rows).toEqual([
      [1, null, null],
      [2, 3, 4]
    ])
    // header widened to match the widest row
    expect(out.columns).toEqual(['a', 'b', ''])
  })

  it('uses the column count as the width when rows are narrower', () => {
    const out = normalizeSheet({ name: 'S', columns: ['a', 'b', 'c'], rows: [[1]] })
    expect(out.rows).toEqual([[1, null, null]])
    expect(out.columns).toEqual(['a', 'b', 'c'])
  })

  it('handles an empty sheet without throwing', () => {
    const out = normalizeSheet({ name: 'S', columns: [], rows: [] })
    expect(out.rows).toEqual([])
    expect(out.columns).toEqual([])
  })

  it('does not mutate the input sheet', () => {
    const sheet = { name: 'S', columns: ['a'], rows: [[1, 2]] }
    const snapshot = JSON.stringify(sheet)
    normalizeSheet(sheet)
    expect(JSON.stringify(sheet)).toBe(snapshot)
  })
})

describe('normalizeXlsxSpec', () => {
  it('normalizes every sheet in the spec', () => {
    const spec: XlsxSpec = {
      kind: 'xlsx',
      title: 'T',
      sheets: [
        { name: 'A', columns: ['x'], rows: [[1, 2]] },
        { name: 'B', columns: ['y', 'z'], rows: [[3]] }
      ]
    }
    const out = normalizeXlsxSpec(spec)
    expect(out.sheets[0].rows).toEqual([[1, 2]])
    expect(out.sheets[0].columns).toEqual(['x', ''])
    expect(out.sheets[1].rows).toEqual([[3, null]])
  })
})

describe('extForKind', () => {
  it('maps kinds to file extensions', () => {
    expect(extForKind('docx')).toBe('docx')
    expect(extForKind('pptx')).toBe('pptx')
    expect(extForKind('xlsx')).toBe('xlsx')
  })
})
