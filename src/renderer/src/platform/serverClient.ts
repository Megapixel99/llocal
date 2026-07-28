/**
 * Typed helpers for the companion-server endpoints that are used by the mobile
 * UI directly (Git + command execution + health), as opposed to the chat/RAG
 * paths which flow through the `window.api` bridge. Everything reads the current
 * server config (base URL + bearer token) at call time.
 */
import { getGitConfig, getServerConfig } from './config'

function base(): { baseUrl: string; token: string } {
  const cfg = getServerConfig()
  if (!cfg.baseUrl) throw new Error('No companion server configured (Settings → Server & Repository).')
  return cfg
}

const DEFAULT_TIMEOUT_MS = 8000

/**
 * fetch() with a hard timeout. Without this, an unreachable host/port where packets are silently
 * dropped (a firewall, or a public IP with no port-forward) leaves the request hanging forever — so
 * the "Test server" button would show neither success nor error. On timeout we throw a clear message.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `timed out after ${timeoutMs / 1000}s — check the URL/port and that the server is reachable from this device`
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = base()
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
  return data as T
}

export interface HealthResponse {
  ok: boolean
  version: string
  execEnabled: boolean
}

/** Health check against an explicit URL/token (used by the settings "Test" button). */
export async function pingServer(baseUrl: string, token: string): Promise<HealthResponse> {
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/health`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  return (await res.json()) as HealthResponse
}

export interface PairingResponse {
  payload: string
  serverUrl: string
  candidateUrls: string[]
  hosts: string[]
  port: number
  version: string
  execEnabled: boolean
  execWarning?: string
}

/**
 * Fetch (or rotate) the companion server's pairing payload. Takes an explicit
 * URL/token so it works with values just typed into the settings form, before
 * they're saved. `rotate` mints a brand-new token server-side — the OLD token
 * (including the one used for this very call) stops working afterwards, so the
 * caller must persist the returned payload's token.
 */
export async function fetchPairing(
  baseUrl: string,
  token: string,
  rotate = false
): Promise<PairingResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/pairing${rotate ? '/rotate' : ''}`
  const res = await fetchWithTimeout(url, {
    method: rotate ? 'POST' : 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`)
  return data as PairingResponse
}

/** Reachability check for an Ollama server (used by the settings "Test" button). */
export async function pingOllama(baseUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/api/tags`)
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const data = (await res.json()) as { models?: { name: string }[] }
  return (data.models ?? []).map((m) => m.name)
}

// --- Git ---
export const git = {
  clone: () => {
    const g = getGitConfig()
    return req<{ repoKey: string; dir: string }>('/git/clone', {
      method: 'POST',
      body: JSON.stringify({ owner: g.owner, repo: g.repo, branch: g.branch, token: g.token })
    })
  },
  // List repositories the configured GitHub token can access (mobile repo picker).
  repos: () => {
    const g = getGitConfig()
    return req<{
      repos: Array<{ owner: string; repo: string; fullName: string; branch: string; private: boolean }>
    }>('/git/repos', { method: 'POST', body: JSON.stringify({ token: g.token }) })
  },
  tree: () => {
    const g = getGitConfig()
    return req<{ files: string[] }>(
      `/git/tree?owner=${encodeURIComponent(g.owner)}&repo=${encodeURIComponent(g.repo)}`
    )
  },
  read: (path: string) => {
    const g = getGitConfig()
    return req<{ path: string; content: string }>(
      `/git/file?owner=${encodeURIComponent(g.owner)}&repo=${encodeURIComponent(g.repo)}&path=${encodeURIComponent(path)}`
    )
  },
  write: (path: string, content: string, message: string) => {
    const g = getGitConfig()
    return req<{ ok: boolean; output: string }>('/git/file', {
      method: 'PUT',
      body: JSON.stringify({ owner: g.owner, repo: g.repo, path, content, message })
    })
  },
  push: () => {
    const g = getGitConfig()
    return req<{ ok: boolean; output: string }>('/git/push', {
      method: 'POST',
      body: JSON.stringify({ owner: g.owner, repo: g.repo, branch: g.branch })
    })
  },
  pull: () => {
    const g = getGitConfig()
    return req<{ ok: boolean; output: string }>('/git/pull', {
      method: 'POST',
      body: JSON.stringify({ owner: g.owner, repo: g.repo })
    })
  }
}

// --- Command execution on the host ---
export interface ExecResult {
  stdout: string
  stderr: string
  code: number
  /** Present when /exec is enabled; a reminder that the command ran on the host. */
  warning?: string
}
export function execCommand(command: string): Promise<ExecResult> {
  const g = getGitConfig()
  return req<ExecResult>('/exec', {
    method: 'POST',
    body: JSON.stringify({ command, owner: g.owner || undefined, repo: g.repo || undefined })
  })
}
