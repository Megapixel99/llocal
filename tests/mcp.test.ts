import { describe, it, expect } from 'vitest'
import {
  parseMcpServer,
  safeParseMcpServer,
  parseMcpServers,
  buildRpcRequest,
  buildRpcNotification,
  parseRpcResponse,
  correlateResponse,
  mcpToolName,
  parseMcpToolName,
  isMcpToolName,
  normalizeTool,
  normalizeTools,
  mapToolResult,
  MCP_TOOL_PREFIX
} from '../src/shared/mcp'

describe('MCP server config validation', () => {
  it('parses a valid stdio server and applies defaults for args/env', () => {
    const server = parseMcpServer({
      name: 'filesystem',
      enabled: true,
      type: 'stdio',
      command: 'npx'
    })
    expect(server).toEqual({
      name: 'filesystem',
      enabled: true,
      type: 'stdio',
      command: 'npx',
      args: [],
      env: {}
    })
  })

  it('parses a valid http server', () => {
    const res = safeParseMcpServer({
      name: 'remote',
      enabled: false,
      type: 'http',
      url: 'http://localhost:8000/mcp'
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.server.type).toBe('http')
      expect(res.server.enabled).toBe(false)
    }
  })

  it('rejects an unknown transport type', () => {
    const res = safeParseMcpServer({ name: 'x', enabled: true, type: 'websocket', url: 'http://x' })
    expect(res.ok).toBe(false)
  })

  it('rejects an empty name', () => {
    const res = safeParseMcpServer({ name: '', enabled: true, type: 'stdio', command: 'npx' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/name/)
  })

  it('rejects a stdio server missing its command', () => {
    expect(safeParseMcpServer({ name: 'x', enabled: true, type: 'stdio' }).ok).toBe(false)
  })

  it('rejects an http server with a non-URL', () => {
    expect(
      safeParseMcpServer({ name: 'x', enabled: true, type: 'http', url: 'not a url' }).ok
    ).toBe(false)
  })

  it('parseMcpServers keeps valid entries and drops invalid ones', () => {
    const list = parseMcpServers([
      { name: 'good', enabled: true, type: 'stdio', command: 'npx' },
      { name: '', enabled: true, type: 'stdio', command: 'npx' },
      { name: 'good2', enabled: true, type: 'http', url: 'http://h/mcp' },
      'garbage'
    ])
    expect(list.map((s) => s.name)).toEqual(['good', 'good2'])
  })

  it('parseMcpServers returns [] for non-array input', () => {
    expect(parseMcpServers(undefined)).toEqual([])
    expect(parseMcpServers({})).toEqual([])
  })
})

describe('JSON-RPC 2.0 helpers', () => {
  it('builds a request with jsonrpc/id/method/params', () => {
    expect(buildRpcRequest('tools/list', { cursor: 'x' }, 1)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { cursor: 'x' }
    })
  })

  it('omits params when undefined', () => {
    const req = buildRpcRequest('ping', undefined, 2)
    expect(req).toEqual({ jsonrpc: '2.0', id: 2, method: 'ping' })
    expect('params' in req).toBe(false)
  })

  it('builds a notification with no id', () => {
    const note = buildRpcNotification('notifications/initialized')
    expect(note).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect('id' in note).toBe(false)
  })

  it('parses a successful response (string or object)', () => {
    const obj = { jsonrpc: '2.0', id: 7, result: { tools: [] } }
    expect(parseRpcResponse(obj)).toEqual({ id: 7, result: { tools: [] } })
    expect(parseRpcResponse(JSON.stringify(obj))).toEqual({ id: 7, result: { tools: [] } })
  })

  it('throws on a JSON-RPC error response', () => {
    expect(() =>
      parseRpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } })
    ).toThrow(/-32601: Method not found/)
  })

  it('throws on a malformed envelope', () => {
    expect(() => parseRpcResponse({ id: 1, result: {} })).toThrow()
  })

  it('correlates a response to the request id', () => {
    const req = buildRpcRequest('tools/call', {}, 42)
    const parsed = correlateResponse(req, { jsonrpc: '2.0', id: 42, result: 'ok' })
    expect(parsed.result).toBe('ok')
  })

  it('throws when the response id does not match the request', () => {
    const req = buildRpcRequest('tools/call', {}, 42)
    expect(() => correlateResponse(req, { jsonrpc: '2.0', id: 99, result: 'ok' })).toThrow(
      /id mismatch/
    )
  })
})

describe('tool name namespacing', () => {
  it('round-trips a namespaced tool name', () => {
    const name = mcpToolName('files', 'read_file')
    expect(name).toBe(`${MCP_TOOL_PREFIX}files__read_file`)
    expect(parseMcpToolName(name)).toEqual({ server: 'files', tool: 'read_file' })
  })

  it('preserves underscores in the tool part', () => {
    expect(parseMcpToolName('mcp__srv__do__a__thing')).toEqual({
      server: 'srv',
      tool: 'do__a__thing'
    })
  })

  it('returns null for a non-MCP name', () => {
    expect(parseMcpToolName('write_file')).toBeNull()
    expect(isMcpToolName('write_file')).toBe(false)
    expect(isMcpToolName('mcp__a__b')).toBe(true)
  })

  it('returns null for a malformed MCP name', () => {
    expect(parseMcpToolName('mcp__onlyserver')).toBeNull()
  })
})

describe('normalizeTool', () => {
  it('maps an MCP tool def into LLocal agent tool shape', () => {
    const normalized = normalizeTool('files', {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    })
    expect(normalized).toEqual({
      type: 'function',
      function: {
        name: 'mcp__files__read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
      }
    })
  })

  it('falls back to an empty object schema when inputSchema is missing', () => {
    const normalized = normalizeTool('s', { name: 'noargs' })
    expect(normalized.function.description).toBe('')
    expect(normalized.function.parameters).toEqual({ type: 'object', properties: {} })
  })

  it('normalizes a whole list', () => {
    const tools = normalizeTools('s', [{ name: 'a' }, { name: 'b' }])
    expect(tools.map((tool) => tool.function.name)).toEqual(['mcp__s__a', 'mcp__s__b'])
  })
})

describe('mapToolResult', () => {
  it('concatenates text content items', () => {
    expect(
      mapToolResult({
        content: [
          { type: 'text', text: 'line 1' },
          { type: 'text', text: 'line 2' }
        ]
      })
    ).toBe('line 1\nline 2')
  })

  it('prefixes an error result with "Error:"', () => {
    expect(mapToolResult({ content: [{ type: 'text', text: 'boom' }], isError: true })).toBe(
      'Error: boom'
    )
  })

  it('summarises non-text content kinds', () => {
    expect(mapToolResult({ content: [{ type: 'image', mimeType: 'image/png' }] })).toBe(
      '[image image/png]'
    )
  })

  it('handles an empty content array', () => {
    expect(mapToolResult({ content: [] })).toBe('(empty result)')
  })

  it('handles a bare string result (no content envelope)', () => {
    expect(mapToolResult('plain')).toBe('plain')
  })

  it('handles a null/undefined result', () => {
    expect(mapToolResult(null)).toBe('(no result)')
    expect(mapToolResult(undefined)).toBe('(no result)')
  })
})
