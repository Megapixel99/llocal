/**
 * HTTP implementation of the `window.api` bridge for the mobile / web build.
 *
 * The Electron preload exposes 16 methods over IPC. On mobile there is no IPC,
 * so we provide the same shape backed by the companion server (for the native
 * features: RAG, web search, TTS) or local logic (i18n, platform stubs). Once
 * installed as `window.api`, every existing renderer call site works unchanged.
 */
import { getServerConfig } from './config'
import { webChangeLanguage, webGetLanguages, webTranslate } from './i18n-web'
import { bundledCommands } from './bundledCommands'

interface WebSearchType {
  prompt: string
  sources: string
}
interface AddKnowledgeType {
  path: string
  fileName: string
}
interface RagReturn {
  prompt: string
  sources: string
}
interface CommandType {
  name: string
  namespace: string
  description: string
  argumentHint: string
  model: string
  allowedTools: string
  body: string
  source: string
}

/** Shape identical to the Window['api'] contract in src/preload/index.d.ts. */
export interface LlocalApi {
  checkingOllama: () => Promise<boolean>
  checkingBinaries: () => Promise<boolean>
  checkingBinarySize: () => Promise<boolean>
  downloadingOllama: () => Promise<string>
  installingOllama: () => Promise<boolean>
  checkVersion: () => Promise<string>
  checkPlatform: () => Promise<string>
  experimentalSearch: (searchQuery: string, links: string[]) => Promise<WebSearchType>
  addKnowledge: (file?: string) => Promise<AddKnowledgeType>
  similaritySearch: (selectedKnowledge: AddKnowledgeType[], prompt: string) => Promise<RagReturn>
  getVectorDbList: () => Promise<AddKnowledgeType[]>
  deleteVectorDb: (indexPath: string) => Promise<boolean>
  listCommands: () => Promise<CommandType[]>
  translate: (key: string, options: object) => string
  changeLanguage: (language: string) => Promise<boolean>
  getLanguages: () => Promise<readonly string[]>
  titleBar: (event: string) => void
  textToSpeech: (text: string) => Promise<ArrayBuffer>
  // Added on the desktop coding-agent update. These operate on a LOCAL folder,
  // which a phone doesn't have, so on mobile they degrade gracefully. The mobile
  // Git workflow lives in Settings → Repo & Console (companion-server backed).
  addKnowledgeFolder: () => Promise<{ folder: string; added: AddKnowledgeType[] }>
  selectFolder: () => Promise<string>
  getGitCapabilities: () => Promise<{ git: boolean; gh: boolean; ghAuth: boolean }>
  getGitInfo: (folder: string) => Promise<{ isRepo: boolean }>
  listWorktrees: (folder: string) => Promise<unknown[]>
  createWorktree: (folder: string, name: string) => Promise<string>
  createPullRequest: (folder: string, title: string, body: string) => Promise<string>
  getAgentTools: () => Promise<{ tools: object[]; mutating: string[] }>
  runAgentTool: (root: string, name: string, args: object) => Promise<string>
  mcpListTools: (servers: object[]) => Promise<object[]>
  mcpCallTool: (servers: object[], name: string, args: object) => Promise<string>
  // Scheduling + native OS notifications are desktop-only. The shared renderer (InputForm)
  // calls these unconditionally, so the mobile/web shim MUST provide them or the whole app
  // crashes to a blank screen. They degrade to safe no-ops here.
  setScheduleAgentMode: (mode: string) => Promise<void>
  onScheduleFire: (cb: (task: unknown) => void) => () => void
  onScheduleNotice: (cb: (notice: unknown) => void) => () => void
  // The Scheduled Tasks settings tab calls these on mount / on save; without them the tab throws
  // and the ErrorBoundary blanks the whole app. Scheduling needs a background runner the phone
  // doesn't have, so they degrade to an in-memory no-op (nothing is persisted or ever fires).
  listSchedules: () => Promise<unknown[]>
  saveSchedule: (task: unknown) => Promise<unknown[]>
  deleteSchedule: (id: string) => Promise<unknown[]>
  runScheduleNow: (id: string) => Promise<boolean>
  notify: (event: string, payload: unknown, prefs: unknown) => Promise<boolean>
  notifySetPrefs: (prefs: unknown) => Promise<void>
  // Local one-shot exec — desktop-only. On mobile, code-block Run goes to the companion
  // server's /exec via runCommand.ts, so this shim member is never actually called.
  execLocal: (opts: { command: string; cwd?: string }) => Promise<{ stdout: string; stderr: string; code: number }>
  // The interactive terminal spawns a local child process — desktop-only. Stubbed on mobile so the
  // Code-tab terminal opens without crashing (subscriptions are no-ops; start reports unavailable).
  startTerminal: (opts: { command: string; cwd?: string }) => Promise<string>
  sendTerminalInput: (sessionId: string, data: string) => Promise<boolean>
  killTerminal: (sessionId: string) => Promise<boolean>
  onTerminalData: (cb: (payload: { sessionId: string; chunk: string }) => void) => () => void
  onTerminalExit: (cb: (payload: { sessionId: string; code: number | null }) => void) => () => void
}

const DESKTOP_ONLY = 'This feature is desktop-only. On mobile, use Settings → Repo & Console.'

function requireServer(): { baseUrl: string; token: string } {
  const cfg = getServerConfig()
  if (!cfg.baseUrl) {
    throw new Error(
      'No companion server configured. Set the server URL in Settings → Server & Repository.'
    )
  }
  return cfg
}

function authHeaders(token: string, json = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, token } = requireServer()
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token, !(init.body instanceof FormData)), ...(init.headers ?? {}) }
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Companion server error ${res.status}: ${text || res.statusText}`)
  }
  return res
}

async function serverJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await serverFetch(path, init)
  return (await res.json()) as T
}

export function createHttpApi(): LlocalApi {
  return {
    // --- Ollama binary management: not applicable on mobile (remote server). ---
    // Returning "installed/present" short-circuits the desktop install flow.
    checkingOllama: async () => true,
    checkingBinaries: async () => true,
    checkingBinarySize: async () => true,
    downloadingOllama: async () => 'already-present',
    installingOllama: async () => true,

    checkVersion: async () => {
      try {
        const { version } = await serverJson<{ version: string }>('/health')
        return version || 'mobile'
      } catch {
        return 'mobile'
      }
    },

    // Non-win32 value hides the custom Windows titlebar in App.tsx.
    checkPlatform: async () => 'mobile',

    experimentalSearch: (searchQuery, links) =>
      serverJson<WebSearchType>('/websearch', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, links })
      }),

    // On mobile a bare `addKnowledge()` (native file dialog) is not possible;
    // callers pass a repo-relative path, and file uploads use a dedicated UI.
    addKnowledge: (file = '') => {
      if (!file) {
        return Promise.reject(
          new Error('Use the upload button to add files to the knowledge base on mobile.')
        )
      }
      return serverJson<AddKnowledgeType>('/rag/add', {
        method: 'POST',
        body: JSON.stringify({ repoPath: file })
      })
    },

    similaritySearch: (selectedKnowledge, prompt) =>
      serverJson<RagReturn>('/rag/similarity', {
        method: 'POST',
        body: JSON.stringify({ selectedKnowledge, prompt })
      }),

    getVectorDbList: () => serverJson<AddKnowledgeType[]>('/rag/list'),

    // Commands live on the companion-server host's filesystem. If the server is
    // older and lacks the endpoint, degrade to "no commands" rather than error.
    listCommands: async () => {
      try {
        const fromServer = await serverJson<CommandType[]>('/commands/list')
        if (fromServer.length > 0) return fromServer
      } catch {
        /* server older/absent — fall back to the bundled examples below */
      }
      return bundledCommands() as unknown as CommandType[]
    },

    deleteVectorDb: async (indexPath) => {
      await serverFetch('/rag/delete', {
        method: 'DELETE',
        body: JSON.stringify({ indexPath })
      })
      return true
    },

    // --- i18n handled locally in the renderer (synchronous). ---
    translate: (key, options) => webTranslate(key, options),
    changeLanguage: (language) => webChangeLanguage(language),
    getLanguages: async () => webGetLanguages(),

    // No custom window chrome on mobile.
    titleBar: () => {},

    textToSpeech: async (text) => {
      const res = await serverFetch('/tts', {
        method: 'POST',
        body: JSON.stringify({ text })
      })
      return await res.arrayBuffer()
    },

    // --- Desktop coding-agent surface: graceful mobile fallbacks. ---
    addKnowledgeFolder: () => Promise.reject(new Error(DESKTOP_ONLY)),
    selectFolder: async () => '',
    getGitCapabilities: async () => ({ git: false, gh: false, ghAuth: false }),
    getGitInfo: async () => ({ isRepo: false }),
    listWorktrees: async () => [],
    createWorktree: () => Promise.reject(new Error(DESKTOP_ONLY)),
    createPullRequest: () => Promise.reject(new Error(DESKTOP_ONLY)),
    getAgentTools: async () => ({ tools: [], mutating: [] }),
    runAgentTool: () => Promise.reject(new Error(DESKTOP_ONLY)),
    mcpListTools: async () => [],
    mcpCallTool: () => Promise.reject(new Error(DESKTOP_ONLY)),

    // Scheduling + notifications are desktop-only; safe no-ops on mobile so the shared
    // renderer doesn't call an undefined method and blank the app. onSchedule* return an
    // unsubscribe function (matching the Electron event-subscription contract).
    setScheduleAgentMode: async () => {},
    onScheduleFire: () => () => {},
    onScheduleNotice: () => () => {},
    // The Scheduled Tasks tab reads on mount and writes on save; with no scheduler on the phone these
    // just report an empty list / echo nothing so the tab renders and doesn't crash the app.
    listSchedules: async () => [],
    saveSchedule: async () => [],
    deleteSchedule: async () => [],
    runScheduleNow: async () => false,
    notify: async () => false,
    notifySetPrefs: async () => {},

    // Interactive terminal is desktop-only (local child process). No-op subscriptions + a clear
    // error on start so the panel degrades instead of crashing the app on mobile.
    execLocal: () => Promise.reject(new Error(DESKTOP_ONLY)),
    startTerminal: () => Promise.reject(new Error(DESKTOP_ONLY)),
    sendTerminalInput: async () => false,
    killTerminal: async () => false,
    onTerminalData: () => () => {},
    onTerminalExit: () => () => {}
  }
}
