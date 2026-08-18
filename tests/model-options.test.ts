import { describe, it, expect } from 'vitest'
import {
  DETERMINISTIC_SAMPLING,
  extractContextLength,
  modelOptions
} from '../src/shared/model-options'

describe('modelOptions', () => {
  it('sends nothing for a normal conversational call', () => {
    // Conversational calls keep the model's own Modelfile sampling and Ollama's own context sizing.
    expect(modelOptions({})).toBeUndefined()
    expect(modelOptions({ deterministic: false })).toBeUndefined()
  })

  it('pins sampling for machine-read calls', () => {
    expect(modelOptions({ deterministic: true })).toEqual(DETERMINISTIC_SAMPLING)
  })

  it('caps the reply length when asked', () => {
    expect(modelOptions({ deterministic: true, numPredict: 20 })).toEqual({
      temperature: 0,
      top_p: 1,
      num_predict: 20
    })
    expect(modelOptions({ numPredict: 200 })).toEqual({ num_predict: 200 })
  })

  it('never sets num_ctx — capping the window is what truncates long chats', () => {
    for (const input of [{}, { deterministic: true }, { numPredict: 20 }]) {
      expect(modelOptions(input) ?? {}).not.toHaveProperty('num_ctx')
    }
  })
})

describe('extractContextLength', () => {
  it('reads the architecture-prefixed key from a Map (current Ollama)', () => {
    const info = { model_info: new Map<string, unknown>([['gemma3.context_length', 8192]]) }
    expect(extractContextLength(info)).toBe(8192)
  })

  it('reads it from a plain object (older Ollama)', () => {
    expect(extractContextLength({ model_info: { 'llama.context_length': 4096 } })).toBe(4096)
  })

  it('returns 0 when the field is missing', () => {
    expect(extractContextLength({})).toBe(0)
    expect(extractContextLength({ model_info: { 'llama.block_count': 32 } })).toBe(0)
  })
})
