/**
 * MCP (Model Context Protocol) client — Electron main process.
 *
 * Connects to a configured MCP server, performs the `initialize` handshake, and
 * exposes `tools/list` and `tools/call`. Two transports are supported, both built
 * on Node built-ins only (NO @modelcontextprotocol/sdk):
 *   - stdio: launch the server with child_process and exchange newline-delimited
 *     JSON-RPC messages over its stdin/stdout, and
 *   - http:  POST JSON-RPC to the server URL (handling both plain JSON and
 *     text/event-stream replies).
 *
 * The pure JSON-RPC + normalization logic lives in src/shared/mcp.ts; this file is
 * only the I/O around it. Connections are opened per operation and torn down after,
 * which keeps the IPC handlers stateless and avoids leaking child processes.
 */
import { spawn } from 'child_process'
import process from 'node:process'
import {
  buildRpcRequest,
  buildRpcNotification,
  parseRpcResponse,
  normalizeTool,
  mapToolResult,
  parseMcpToolName,
  type McpServer,
  type StdioServer,
  type HttpServer,
  type McpToolDef,
  type NormalizedTool
} from '../../shared/mcp'

const REQUEST_TIMEOUT_MS = 30_000
const PROTOCOL_VERSION = '2024-11-05'
const CLIENT_INFO = { name: 'LLocal', version: '1.0.0' }

/** A minimal JSON-RPC transport: request/response, fire-and-forget notify, and close. */
interface Transport {
  request(method: string, params?: unknown): Promise<unknown>
  notify(method: string, params?: unknown): void
  close(): void
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

function createStdioTransport(server: StdioServer): Transport {
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let buffer = ''
  let stderr = ''
  let id = 0

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let msg: { id?: unknown }
      try {
        msg = JSON.parse(line)
      } catch {
        continue // server log noise or a partial line — ignore
      }
      const replyId = typeof msg.id === 'number' ? msg.id : undefined
      if (replyId === undefined || !pending.has(replyId)) continue
      const p = pending.get(replyId)!
      pending.delete(replyId)
      try {
        p.resolve(parseRpcResponse(msg).result)
      } catch (e) {
        p.reject(e as Error)
      }
    }
  })

  child.stderr.on('data', (c: Buffer) => {
    stderr += c.toString()
    if (stderr.length > 4000) stderr = stderr.slice(-4000)
  })

  const failAll = (err: Error): void => {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
  }
  child.on('error', (e) => failAll(new Error(`Failed to launch "${server.command}": ${e.message}`)))
  child.on('exit', (code) => {
    if (pending.size) failAll(new Error(`MCP server exited (code ${code ?? '?'})\n${stderr.slice(-500)}`))
  })

  return {
    request(method, params): Promise<unknown> {
      const reqId = ++id
      const req = buildRpcRequest(method, params, reqId)
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.delete(reqId)) reject(new Error(`MCP request timed out: ${method}`))
        }, REQUEST_TIMEOUT_MS)
        pending.set(reqId, {
          resolve: (v) => {
            clearTimeout(timer)
            resolve(v)
          },
          reject: (e) => {
            clearTimeout(timer)
            reject(e)
          }
        })
        try {
          child.stdin.write(JSON.stringify(req) + '\n')
        } catch (e) {
          pending.delete(reqId)
          clearTimeout(timer)
          reject(e as Error)
        }
      })
    },
    notify(method, params): void {
      try {
        child.stdin.write(JSON.stringify(buildRpcNotification(method, params)) + '\n')
      } catch {
        /* best effort */
      }
    },
    close(): void {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// http transport
// ---------------------------------------------------------------------------

/** Extract the JSON-RPC envelope from an HTTP body (plain JSON or an SSE stream). */
function extractJsonRpc(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return {}
  if (trimmed[0] === '{' || trimmed[0] === '[') return JSON.parse(trimmed)
  // text/event-stream: pull the JSON out of `data:` lines, preferring one with a result/error.
  const dataLines = trimmed
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
  for (const d of dataLines) {
    try {
      const obj = JSON.parse(d) as { result?: unknown; error?: unknown }
      if (obj && (obj.result !== undefined || obj.error !== undefined)) return obj
    } catch {
      /* keep looking */
    }
  }
  if (dataLines.length) return JSON.parse(dataLines[dataLines.length - 1])
  return JSON.parse(trimmed)
}

function createHttpTransport(server: HttpServer): Transport {
  let id = 0
  let sessionId: string | undefined

  const post = async (body: object, expectResponse: boolean): Promise<unknown> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...server.headers
    }
    if (sessionId) headers['mcp-session-id'] = sessionId

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    const sid = res.headers.get('mcp-session-id')
    if (sid) sessionId = sid
    if (!expectResponse) return undefined
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return extractJsonRpc(await res.text())
  }

  return {
    async request(method, params): Promise<unknown> {
      const req = buildRpcRequest(method, params, ++id)
      const raw = await post(req, true)
      return parseRpcResponse(raw).result
    },
    notify(method, params): void {
      void post(buildRpcNotification(method, params), false).catch(() => {
        /* best effort */
      })
    },
    close(): void {
      /* stateless */
    }
  }
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

function createTransport(server: McpServer): Transport {
  return server.type === 'stdio' ? createStdioTransport(server) : createHttpTransport(server)
}

/** Open a connection, run the initialize handshake, hand it to `fn`, then always close. */
async function withConnection<T>(server: McpServer, fn: (t: Transport) => Promise<T>): Promise<T> {
  const transport = createTransport(server)
  try {
    await transport.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    })
    transport.notify('notifications/initialized')
    return await fn(transport)
  } finally {
    transport.close()
  }
}

// ---------------------------------------------------------------------------
// Public API (used by the IPC handlers in src/main/index.ts)
// ---------------------------------------------------------------------------

/**
 * Connect to every enabled server, list its tools, and return them normalized into
 * LLocal's agent tool shape (names namespaced as `mcp__<server>__<tool>`). A server
 * that fails to connect is skipped rather than failing the whole list.
 */
export async function listMcpTools(servers: McpServer[]): Promise<NormalizedTool[]> {
  const out: NormalizedTool[] = []
  for (const server of servers) {
    if (!server.enabled) continue
    try {
      const tools = await withConnection(server, async (t) => {
        const res = (await t.request('tools/list', {})) as { tools?: McpToolDef[] }
        return res?.tools ?? []
      })
      for (const tool of tools) out.push(normalizeTool(server.name, tool))
    } catch (e) {
      // Unreachable / misconfigured server — surface as a console warning and move on.
      console.warn(`MCP: failed to list tools for "${server.name}":`, (e as Error).message)
    }
  }
  return out
}

/**
 * Dispatch a namespaced MCP tool call (`mcp__<server>__<tool>`) to its owning server
 * and return the result mapped to the agent's tool-result string.
 */
export async function callMcpTool(
  servers: McpServer[],
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const parsed = parseMcpToolName(toolName)
  if (!parsed) return `Error: "${toolName}" is not an MCP tool name.`
  const server = servers.find((s) => s.name === parsed.server && s.enabled)
  if (!server) return `Error: no enabled MCP server named "${parsed.server}".`
  try {
    return await withConnection(server, async (t) => {
      const result = await t.request('tools/call', { name: parsed.tool, arguments: args ?? {} })
      return mapToolResult(result)
    })
  } catch (e) {
    return `Error: ${(e as Error).message}`
  }
}
