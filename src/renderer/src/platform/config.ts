/**
 * Cross-platform runtime configuration.
 *
 * On Electron this mostly stays at its defaults (a local Ollama server and no
 * companion server). On mobile / web builds the user fills these in from the
 * "Server & Repository" settings panel so the same renderer can talk to a
 * remote Ollama instance and a companion server running on the Ollama host.
 *
 * Values are persisted to localStorage (available in both Electron's renderer
 * and a Capacitor WebView) and mirrored into a jotai atom for reactive UI.
 */
import { atom } from 'jotai'
import type { McpServer } from '../../../shared/mcp'

export type GitProvider = 'github'

export interface GitConfig {
  provider: GitProvider
  token: string
  owner: string
  repo: string
  branch: string
}

export interface RemoteConfig {
  /** Base URL of the Ollama server the app chats against (e.g. http://192.168.1.10:11434). */
  ollamaBaseUrl: string
  /** Base URL of the companion server on the Ollama host (e.g. http://192.168.1.10:8787). */
  serverBaseUrl: string
  /** Bearer token shared with the companion server. */
  serverToken: string
  git: GitConfig
  /** External MCP (Model Context Protocol) servers whose tools the coding agent can use. */
  mcpServers: McpServer[]
}

const STORAGE_KEY = 'llocal.remoteConfig'

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  // Keeps the desktop app's original behavior when nothing has been configured.
  ollamaBaseUrl: 'http://localhost:11434',
  serverBaseUrl: '',
  serverToken: '',
  git: {
    provider: 'github',
    token: '',
    owner: '',
    repo: '',
    branch: 'main'
  },
  mcpServers: []
}

function readConfig(): RemoteConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_REMOTE_CONFIG }
    const parsed = JSON.parse(raw) as Partial<RemoteConfig>
    // Merge so newly-added fields fall back to defaults.
    return {
      ...DEFAULT_REMOTE_CONFIG,
      ...parsed,
      git: { ...DEFAULT_REMOTE_CONFIG.git, ...(parsed.git ?? {}) },
      mcpServers: parsed.mcpServers ?? []
    }
  } catch {
    return { ...DEFAULT_REMOTE_CONFIG }
  }
}

let current: RemoteConfig = readConfig()

/** Non-reactive getter for use outside of React (ollama client, http adapter). */
export function getRemoteConfig(): RemoteConfig {
  return current
}

export function getOllamaBaseUrl(): string {
  return current.ollamaBaseUrl || DEFAULT_REMOTE_CONFIG.ollamaBaseUrl
}

export function getServerConfig(): { baseUrl: string; token: string } {
  return { baseUrl: current.serverBaseUrl, token: current.serverToken }
}

export function getGitConfig(): GitConfig {
  return current.git
}

/** Non-reactive getter for the configured MCP servers. */
export function getMcpServers(): McpServer[] {
  return current.mcpServers ?? []
}

/** Persist a partial update and return the merged config. */
export function saveRemoteConfig(patch: Partial<RemoteConfig>): RemoteConfig {
  current = {
    ...current,
    ...patch,
    git: { ...current.git, ...(patch.git ?? {}) }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // best-effort persistence
  }
  return current
}

/**
 * jotai atom backed by localStorage. Reading returns the current config;
 * writing accepts a partial patch, persists it, and updates the store.
 */
const baseAtom = atom<RemoteConfig>(current)
export const remoteConfigAtom = atom(
  (get) => get(baseAtom),
  (_get, set, patch: Partial<RemoteConfig>) => {
    const next = saveRemoteConfig(patch)
    set(baseAtom, next)
  }
)
