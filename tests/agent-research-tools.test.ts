import { describe, it, expect } from 'vitest'
import {
  AGENT_RESEARCH_TOOLS,
  REASON_TOOL_NAME,
  DEEP_RESEARCH_TOOL_NAME,
  isResearchToolName,
  extractReasonProblem,
  extractResearchQuery,
  formatResearchResult
} from '../src/renderer/src/utils/agent-research-tools'

/**
 * Unit tests for the coding-agent research tools (src/.../utils/agent-research-tools.ts).
 * This module is pure — no Ollama/Electron — so we can assert the tool schemas,
 * name-matching, tolerant argument extraction, and result formatting directly.
 */

describe('AGENT_RESEARCH_TOOLS definitions', () => {
  it('exposes exactly the reason and deep_research function tools', () => {
    const names = AGENT_RESEARCH_TOOLS.map((t) => t.function.name)
    expect(names).toEqual([REASON_TOOL_NAME, DEEP_RESEARCH_TOOL_NAME])
  })

  it('are well-formed Ollama function tools with a required string param', () => {
    for (const tool of AGENT_RESEARCH_TOOLS) {
      expect(tool.type).toBe('function')
      expect(typeof tool.function.description).toBe('string')
      expect(tool.function.description.length).toBeGreaterThan(0)
      expect(tool.function.parameters.type).toBe('object')
      const required = tool.function.parameters.required
      expect(required).toHaveLength(1)
      const key = required[0]
      expect(tool.function.parameters.properties[key].type).toBe('string')
    }
  })

  it('reason requires "problem" and deep_research requires "query"', () => {
    const reason = AGENT_RESEARCH_TOOLS.find((t) => t.function.name === REASON_TOOL_NAME)!
    const research = AGENT_RESEARCH_TOOLS.find((t) => t.function.name === DEEP_RESEARCH_TOOL_NAME)!
    expect(reason.function.parameters.required).toEqual(['problem'])
    expect(research.function.parameters.required).toEqual(['query'])
  })
})

describe('isResearchToolName', () => {
  it('matches the two research tools', () => {
    expect(isResearchToolName('reason')).toBe(true)
    expect(isResearchToolName('deep_research')).toBe(true)
  })

  it('does not match builtin/file/MCP tools', () => {
    for (const name of ['read_file', 'write_file', 'run_command', 'search', 'mcp__srv__tool']) {
      expect(isResearchToolName(name)).toBe(false)
    }
  })
})

describe('extractReasonProblem', () => {
  it('reads the documented "problem" key', () => {
    expect(extractReasonProblem({ problem: '  reduce this to O(n)  ' })).toBe('reduce this to O(n)')
  })

  it('falls back through sensible aliases', () => {
    expect(extractReasonProblem({ question: 'why?' })).toBe('why?')
    expect(extractReasonProblem({ prompt: 'p' })).toBe('p')
    expect(extractReasonProblem({ task: 't' })).toBe('t')
    expect(extractReasonProblem({ input: 'i' })).toBe('i')
  })

  it('returns empty string when absent or non-string', () => {
    expect(extractReasonProblem({})).toBe('')
    expect(extractReasonProblem({ problem: 42 as unknown as string })).toBe('')
  })
})

describe('extractResearchQuery', () => {
  it('reads the documented "query" key', () => {
    expect(extractResearchQuery({ query: '  react 19 use hook  ' })).toBe('react 19 use hook')
  })

  it('falls back through sensible aliases', () => {
    expect(extractResearchQuery({ q: 'x' })).toBe('x')
    expect(extractResearchQuery({ topic: 'vite csp' })).toBe('vite csp')
    expect(extractResearchQuery({ question: 'what is faiss?' })).toBe('what is faiss?')
    expect(extractResearchQuery({ prompt: 'p' })).toBe('p')
  })

  it('returns empty string when absent or non-string', () => {
    expect(extractResearchQuery({})).toBe('')
    expect(extractResearchQuery({ query: null as unknown as string })).toBe('')
  })
})

describe('formatResearchResult', () => {
  it('appends sources under a heading when present', () => {
    expect(formatResearchResult('The answer.', '[a](http://a)')).toBe(
      'The answer.\n\nSources:\n[a](http://a)'
    )
  })

  it('omits the sources block when there are no sources', () => {
    expect(formatResearchResult('Just the answer.', '')).toBe('Just the answer.')
    expect(formatResearchResult('Just the answer.')).toBe('Just the answer.')
  })

  it('trims and handles empty content gracefully', () => {
    expect(formatResearchResult('  padded  ', '  ')).toBe('padded')
    expect(formatResearchResult('', '')).toBe('No research results.')
  })
})
