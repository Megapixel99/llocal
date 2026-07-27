import { describe, it, expect } from 'vitest'
import {
  BUILTIN_AGENT_TYPES,
  DEFAULT_AGENT_TYPE_ID,
  MAX_SUBAGENT_DEPTH,
  SUBAGENT_TOOL_NAME,
  allowedAgentTypes,
  canSpawnSubagent,
  effectiveChildPolicy,
  extractSubagentTask,
  extractSubagentTypeId,
  filterToolsForPolicy,
  formatSubagentResult,
  getAgentType,
  subagentTool
} from '../src/shared/subagent'

/**
 * Unit tests for the sub-agent core (src/shared/subagent.ts). Pure — no
 * Ollama/Electron — so the registry, tool schema, policy filter, recursion
 * guard, and result formatting are all asserted directly.
 */

const toolDef = (name: string): object => ({ type: 'function', function: { name } })

describe('agent-type registry', () => {
  it('has a default that exists and is read-only', () => {
    const def = getAgentType(DEFAULT_AGENT_TYPE_ID)
    expect(def.id).toBe(DEFAULT_AGENT_TYPE_ID)
    expect(def.toolPolicy).toBe('readonly')
  })

  it('resolves a known id and falls back to the default for unknown', () => {
    expect(getAgentType('coder').toolPolicy).toBe('full')
    expect(getAgentType('nope').id).toBe(DEFAULT_AGENT_TYPE_ID)
    expect(getAgentType(undefined).id).toBe(DEFAULT_AGENT_TYPE_ID)
  })

  it('includes at least one read-only and one full type', () => {
    expect(BUILTIN_AGENT_TYPES.some((t) => t.toolPolicy === 'readonly')).toBe(true)
    expect(BUILTIN_AGENT_TYPES.some((t) => t.toolPolicy === 'full')).toBe(true)
  })
})

describe('allowedAgentTypes (no privilege escalation)', () => {
  it('a full agent may spawn any type', () => {
    expect(allowedAgentTypes('full')).toEqual(BUILTIN_AGENT_TYPES)
  })

  it('a read-only agent may only spawn read-only types', () => {
    const allowed = allowedAgentTypes('readonly')
    expect(allowed.length).toBeGreaterThan(0)
    expect(allowed.every((t) => t.toolPolicy === 'readonly')).toBe(true)
  })
})

describe('canSpawnSubagent (recursion guard)', () => {
  it('allows spawning below the depth cap and blocks at/after it', () => {
    expect(canSpawnSubagent(0)).toBe(true)
    expect(canSpawnSubagent(MAX_SUBAGENT_DEPTH - 1)).toBe(true)
    expect(canSpawnSubagent(MAX_SUBAGENT_DEPTH)).toBe(false)
    expect(canSpawnSubagent(MAX_SUBAGENT_DEPTH + 1)).toBe(false)
  })

  it('honours a custom max', () => {
    expect(canSpawnSubagent(1, 1)).toBe(false)
    expect(canSpawnSubagent(0, 1)).toBe(true)
  })
})

describe('subagentTool schema', () => {
  it('names the tool and requires agent_type + task', () => {
    const tool = subagentTool() as {
      function: { name: string; parameters: { required: string[]; properties: Record<string, { enum?: string[] }> } }
    }
    expect(tool.function.name).toBe(SUBAGENT_TOOL_NAME)
    expect(tool.function.parameters.required.sort()).toEqual(['agent_type', 'task'])
  })

  it('offers exactly the given types as the agent_type enum', () => {
    const readonlyTypes = allowedAgentTypes('readonly')
    const tool = subagentTool(readonlyTypes) as {
      function: { parameters: { properties: { agent_type: { enum: string[] } } } }
    }
    expect(tool.function.parameters.properties.agent_type.enum).toEqual(readonlyTypes.map((t) => t.id))
  })
})

describe('argument extraction', () => {
  it('reads task via documented key and aliases', () => {
    expect(extractSubagentTask({ task: '  do X  ' })).toBe('do X')
    expect(extractSubagentTask({ prompt: 'p' })).toBe('p')
    expect(extractSubagentTask({ instructions: 'i' })).toBe('i')
    expect(extractSubagentTask({})).toBe('')
    expect(extractSubagentTask({ task: 3 as unknown as string })).toBe('')
  })

  it('reads agent_type via documented key and aliases', () => {
    expect(extractSubagentTypeId({ agent_type: 'coder' })).toBe('coder')
    expect(extractSubagentTypeId({ type: 'explorer' })).toBe('explorer')
    expect(extractSubagentTypeId({ role: 'reviewer' })).toBe('reviewer')
    expect(extractSubagentTypeId({})).toBe('')
  })
})

describe('effectiveChildPolicy', () => {
  it('a full parent grants what the child type asks for', () => {
    expect(effectiveChildPolicy('full', 'full')).toBe('full')
    expect(effectiveChildPolicy('full', 'readonly')).toBe('readonly')
  })

  it('a read-only parent floors every child to read-only', () => {
    expect(effectiveChildPolicy('readonly', 'full')).toBe('readonly')
    expect(effectiveChildPolicy('readonly', 'readonly')).toBe('readonly')
  })
})

describe('filterToolsForPolicy', () => {
  const tools = [toolDef('read_file'), toolDef('write_file'), toolDef('run_command'), toolDef('search')]
  const mutating = new Set(['write_file', 'run_command'])

  it('full policy keeps every tool', () => {
    expect(filterToolsForPolicy(tools, mutating, 'full')).toEqual(tools)
  })

  it('readonly policy drops the mutating tools', () => {
    const kept = filterToolsForPolicy(tools, mutating, 'readonly') as { function: { name: string } }[]
    expect(kept.map((t) => t.function.name)).toEqual(['read_file', 'search'])
  })

  it('keeps tools with no resolvable name', () => {
    const weird = [{ type: 'function' }]
    expect(filterToolsForPolicy(weird, mutating, 'readonly')).toEqual(weird)
  })
})

describe('formatSubagentResult', () => {
  it('labels the result with the agent type and task', () => {
    expect(formatSubagentResult('Explorer', 'find the bug', 'Found it at x.ts:10')).toBe(
      '[Explorer sub-agent] task: find the bug\n\nFound it at x.ts:10'
    )
  })

  it('handles an empty transcript', () => {
    expect(formatSubagentResult('Coder', 't', '   ')).toBe('[Coder sub-agent] task: t\n\n(no output)')
  })
})
