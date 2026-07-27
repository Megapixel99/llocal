/**
 * Platform-agnostic MCP (Model Context Protocol) core.
 *
 * This module holds the pure, testable pieces of LLocal's MCP support:
 *   - a zod schema + parser/validator for an MCP server configuration,
 *   - JSON-RPC 2.0 helpers (build a request, parse/validate a response, correlate ids),
 *   - normalizeTool(): map an MCP tool definition into LLocal's agent-tool shape
 *     (the Ollama function-calling schema the agent loop feeds to the model), and
 *   - mapToolResult(): turn an MCP `tools/call` result into the string the agent
 *     loop feeds back to the model.
 *
 * Like src/shared/commands.ts and src/shared/rag-core.ts it has NO Electron / DOM
 * / Node dependency, so it is shared by the Electron main process (the actual
 * connection lives in src/main/utils/mcp-client.ts) and unit-tested directly.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Server configuration
// ---------------------------------------------------------------------------

/** A local server LLocal launches and talks to over stdio (JSON-RPC per line). */
export const stdioServerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({})
})

/** A remote server LLocal reaches over HTTP (JSON-RPC over POST). */
export const httpServerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string()).default({})
})

export const mcpServerSchema = z.discriminatedUnion('type', [stdioServerSchema, httpServerSchema])

export type StdioServer = z.infer<typeof stdioServerSchema>
export type HttpServer = z.infer<typeof httpServerSchema>
export type McpServer = z.infer<typeof mcpServerSchema>

/** Parse + validate a server config, throwing a ZodError on invalid input. */
export function parseMcpServer(raw: unknown): McpServer {
  return mcpServerSchema.parse(raw)
}

/** Non-throwing validation returning either the parsed server or a readable error string. */
export function safeParseMcpServer(
  raw: unknown
): { ok: true; server: McpServer } | { ok: false; error: string } {
  const res = mcpServerSchema.safeParse(raw)
  if (res.success) return { ok: true, server: res.data }
  const error = res.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  return { ok: false, error }
}

/** Validate a whole list, keeping only well-formed servers. */
export function parseMcpServers(raw: unknown): McpServer[] {
  if (!Array.isArray(raw)) return []
  const out: McpServer[] = []
  for (const entry of raw) {
    const res = safeParseMcpServer(entry)
    if (res.ok) out.push(res.server)
  }
  return out
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 helpers
// ---------------------------------------------------------------------------

export type JsonRpcId = number | string

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

/** Build a JSON-RPC 2.0 request. `params` is omitted entirely when undefined. */
export function buildRpcRequest(method: string, params: unknown, id: JsonRpcId): JsonRpcRequest {
  const req: JsonRpcRequest = { jsonrpc: '2.0', id, method }
  if (params !== undefined) req.params = params
  return req
}

/** Build a JSON-RPC 2.0 notification (a request with no id — no response expected). */
export function buildRpcNotification(method: string, params?: unknown): JsonRpcNotification {
  const note: JsonRpcNotification = { jsonrpc: '2.0', method }
  if (params !== undefined) note.params = params
  return note
}

const rpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string(), z.null()]),
  result: z.unknown().optional(),
  error: z
    .object({ code: z.number(), message: z.string(), data: z.unknown().optional() })
    .optional()
})

export interface ParsedRpcResponse {
  id: JsonRpcId | null
  result: unknown
}

/**
 * Validate a JSON-RPC 2.0 response (accepts a raw JSON string or an already-parsed
 * object). Throws on a malformed envelope or when the response carries an error.
 */
export function parseRpcResponse(raw: unknown): ParsedRpcResponse {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
  const res = rpcResponseSchema.parse(obj)
  if (res.error) {
    throw new Error(`MCP error ${res.error.code}: ${res.error.message}`)
  }
  return { id: res.id, result: res.result }
}

/**
 * Parse a response and assert it answers `request` (matching id). Used to correlate
 * a reply with the request that produced it.
 */
export function correlateResponse(request: JsonRpcRequest, raw: unknown): ParsedRpcResponse {
  const parsed = parseRpcResponse(raw)
  if (parsed.id !== request.id) {
    throw new Error(`JSON-RPC id mismatch: expected ${String(request.id)}, got ${String(parsed.id)}`)
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Tool normalization
// ---------------------------------------------------------------------------

/** Prefix used to namespace MCP tool names so they can't collide with builtin tools. */
export const MCP_TOOL_PREFIX = 'mcp__'

/** Build the namespaced tool name exposed to the model: `mcp__<server>__<tool>`. */
export function mcpToolName(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}__${tool}`
}

/** Reverse of mcpToolName. Returns null when the name isn't an MCP tool name. */
export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const idx = rest.indexOf('__')
  if (idx <= 0 || idx + 2 >= rest.length) return null
  return { server: rest.slice(0, idx), tool: rest.slice(idx + 2) }
}

/** Whether a tool name belongs to an MCP server (vs. a builtin agent tool). */
export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX)
}

/** An MCP tool definition as returned by a server's `tools/list`. */
export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

/** LLocal's agent tool shape (the Ollama function-calling schema the agent loop expects). */
export interface NormalizedTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const EMPTY_PARAMS: Record<string, unknown> = { type: 'object', properties: {} }

/**
 * Map an MCP tool definition into LLocal's agent tool shape, matching
 * src/main/utils/agent-tools.ts AGENT_TOOLS: `{ type:'function', function:{ name,
 * description, parameters } }`. The tool name is namespaced with the server name.
 */
export function normalizeTool(server: string, tool: McpToolDef): NormalizedTool {
  const params =
    tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
      ? (tool.inputSchema as Record<string, unknown>)
      : EMPTY_PARAMS
  return {
    type: 'function',
    function: {
      name: mcpToolName(server, tool.name),
      description: tool.description ?? '',
      parameters: params
    }
  }
}

/** Normalize a whole server's tool list. */
export function normalizeTools(server: string, tools: McpToolDef[]): NormalizedTool[] {
  return tools.map((tool) => normalizeTool(server, tool))
}

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

interface McpContentItem {
  type?: string
  text?: string
  mimeType?: string
  resource?: unknown
  [key: string]: unknown
}

/**
 * Map an MCP `tools/call` result into the single string the agent loop feeds back
 * to the model. The MCP result shape is `{ content: ContentItem[], isError?: bool }`;
 * text items are concatenated, other item kinds are summarised, and an error result
 * is prefixed with "Error:" so the model treats it as a failure.
 */
export function mapToolResult(result: unknown): string {
  if (result == null) return '(no result)'

  const r = result as { content?: unknown; isError?: boolean }

  if (!Array.isArray(r.content)) {
    // Some servers return a bare value rather than the content-array envelope.
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  const parts = (r.content as McpContentItem[]).map((item) => {
    if (item.type === 'text' && typeof item.text === 'string') return item.text
    if (item.type === 'image') return `[image ${item.mimeType ?? 'binary'}]`
    if (item.type === 'resource') return `[resource ${JSON.stringify(item.resource ?? {})}]`
    return JSON.stringify(item)
  })

  const text = parts.join('\n').trim() || '(empty result)'
  return r.isError ? `Error: ${text}` : text
}
