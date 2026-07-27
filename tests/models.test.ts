import { describe, it, expect } from 'vitest'
import { filterModels } from '../src/renderer/src/utils/models'

const models = [
  { modelName: 'gemma4:e4b' },
  { modelName: 'qwen3-coder:30b' },
  { modelName: 'llama3.2' },
  { modelName: 'all-minilm' }
]

describe('filterModels', () => {
  it('returns the full list for an empty or whitespace query', () => {
    expect(filterModels(models, '')).toEqual(models)
    expect(filterModels(models, '   ')).toEqual(models)
  })

  it('matches case-insensitively on a substring of the name', () => {
    expect(filterModels(models, 'QWEN').map((m) => m.modelName)).toEqual(['qwen3-coder:30b'])
    expect(filterModels(models, 'llama').map((m) => m.modelName)).toEqual(['llama3.2'])
  })

  it('matches mid-name substrings and can return multiple', () => {
    // "3" appears in qwen3, llama3.2
    expect(filterModels(models, '3').map((m) => m.modelName)).toEqual([
      'qwen3-coder:30b',
      'llama3.2'
    ])
  })

  it('returns empty when nothing matches, preserving input order otherwise', () => {
    expect(filterModels(models, 'zzz')).toEqual([])
  })
})
