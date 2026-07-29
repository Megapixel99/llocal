import { listModels } from '@renderer/hooks/useOllama'
import type { Command } from '@renderer/utils/commands'
import type { MessageMetric } from '../../../../shared/analytics'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../../../../shared/notifications'
import type { ResponseStyleId } from '../../../../shared/styles'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export interface Message {
  role: string
  content: string
}

export interface fileContext {
  path: string,
  fileName: string
}

interface getVectorDb {
  path: string,
  fileName: string
}

interface suggestions {
  show: boolean,
  prompts: string[]
}


export const messages = [
  {
    role: 'user',
    content: 'why is the sky blue?'
  },
  {
    role: 'assistant',
    content: 'due to rayleigh scattering.'
  },
  { role: 'user', content: 'how is that different than mie scattering?' }
]

export const chatAtom = atom<Message[]>([]) // Current Chat
export const selectedChatIndexAtom = atom<string>('') // Selected Chat
// The artifact currently open in the side panel (Claude-style). null = panel closed.
export type ActiveArtifact = { code: string; language: string; title: string }
export const activeArtifactAtom = atom<ActiveArtifact | null>(null)
// A pending Edit/Retry: re-run `prompt` on top of a TRUNCATED history. InputForm (which owns
// promptReq) watches this, runs it, and clears it. Message components just set it.
export const regenerateRequestAtom = atom<{ prompt: string; baseChat: Message[] } | null>(null)
export const streamingAtom = atom<string>('') // Handling Streaming
export const generatingAtom = atom<boolean>(false) // True from when a prompt is sent until the response is complete (drives the thinking animation)
export const stopGeneratingAtom = atom<boolean>(false) // Handling the option to stop generating
export const imageAttatchmentAtom = atom<string>('') // Storing the base64 image
export const experimentalSearchAtom = atom<boolean>(false) // Toggle for websearch
export const fileContextAtom = atom<fileContext[]>([]) // For storing the current file for RAG
// In-chat document attachment (distinct from RAG): extracted text dropped into the next turn's
// context. In-memory + per-turn — cleared after the message is sent.
export const attachedDocAtom = atom<{ name: string; text: string } | null>(null)
export const workingFolderAtom = atomWithStorage<string>('workingFolder', '') // Chosen working folder (like a project dir); persisted, enables git features when it's a repo
export type appTab = 'chat' | 'agent' // left-sidebar tabs: plain chat vs the coding agent
export const activeTabAtom = atomWithStorage<appTab>('activeTab', 'chat')
export type agentMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' // manual = approve every action; acceptEdits = auto-write files but confirm commands; plan = read-only; auto = run everything
export const agentModeAtom = atomWithStorage<agentMode>('agentMode', 'manual')
export const agentApprovalAtom = atom<{ tool: string; args: Record<string, unknown> } | null>(null) // pending mutating action awaiting user approval
export type Effort = 'low' | 'medium' | 'high' // controls how many searches DeepResearch runs
export const effortAtom = atomWithStorage<Effort>('researchEffort', 'medium')
// How much of a model's reasoning to SHOW (display only — never changes what the model generates):
// summary = hide it (answer only) · normal = collapsed behind "Thinking…" · thinking = kept expanded ·
// verbose = reasoning + answer inline, nothing collapsed.
export type Verbosity = 'summary' | 'normal' | 'thinking' | 'verbose'
export const verbosityAtom = atomWithStorage<Verbosity>('reasoningVerbosity', 'normal')
export const mascotEnabledAtom = atomWithStorage<boolean>('mascotEnabled', true) // the little composer mascot ("Lo"); opt-out in Preferences
// Custom instructions (a persistent persona/preferences) + response-style preset, combined into a
// system prompt on the Chat tab (see usePrompt + shared/styles.ts). Synced across devices.
export const customInstructionsAtom = atomWithStorage<string>('customInstructions', '')
export const responseStyleAtom = atomWithStorage<ResponseStyleId>('responseStyle', 'normal')
// Saved/reusable prompts (a "prompt library"); inserted into the composer. Synced across devices.
export interface SavedPrompt {
  id: string
  title: string
  body: string
}
export const promptLibraryAtom = atomWithStorage<SavedPrompt[]>('promptLibrary', [])
export type MascotPhase = 'reading' | 'responding'
export const mascotPhaseAtom = atom<MascotPhase | null>(null) // what the model is doing while generating: reading (thinking/researching) vs responding (writing)
export const knowledgeBaseAtom = atom<getVectorDb[]>([]) // For storing the list of vector db's
export const commandListAtom = atom<Command[]>([]) // Claude Code style slash commands (~/.claude/commands, bundled, etc.)
export const modelListAtom = atom<listModels[]>(JSON.parse(localStorage.getItem('modelList') || '[]') as listModels[]) // Storing List of Models in Local Storage
export const settingsToggleAtom = atom<boolean>(false)
export const isOllamaInstalledAtom = atom<boolean>(false)
export const suggestionsAtom = atom<suggestions>({ show: JSON.parse(localStorage.getItem('showSuggestions') || 'false'), prompts: [] })
export const fileDropAtom = atom<boolean>(false)
export const titleUpdateAtom = atom<number>(0)

// Cross-device sync status (companion server), surfaced by the sidebar indicator.
// 'idle' = no sync yet · 'syncing' = a pull/push in flight · 'ok' = last sync succeeded ·
// 'offline' = last attempt couldn't reach the server.
export type SyncState = 'idle' | 'syncing' | 'ok' | 'offline'
export const syncStatusAtom = atom<{ state: SyncState; lastSyncedAt: number | null }>({
  state: 'idle',
  lastSyncedAt: null
})
export const contextUsageAtom = atom<{ used: number; total: number }>({ used: 0, total: 0 }) // tokens used vs the model's context window
export const sessionMetricsAtom = atom<MessageMetric[]>([]) // per-message token/throughput/tool metrics for the current session (in-memory; drives the analytics panel)

// Native OS notification prefs (global enable + per-event map); persisted in localStorage.
// Stored value is merged over the defaults so newly added event types get a sane default.
function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem('notificationPrefs')
    if (!raw) return DEFAULT_NOTIFICATION_PREFS
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    return {
      enabled: parsed.enabled ?? DEFAULT_NOTIFICATION_PREFS.enabled,
      events: { ...DEFAULT_NOTIFICATION_PREFS.events, ...(parsed.events ?? {}) }
    }
  } catch {
    return DEFAULT_NOTIFICATION_PREFS
  }
}
export const notificationPrefsAtom = atom<NotificationPrefs>(loadNotificationPrefs())

// User Preferences
const url = new URL('/src/assets/themes/galaxia.svg', import.meta.url).href
export const backgroundImageAtom = atom<string>(localStorage.getItem('bg') ?? url)
export const prefModelAtom = atom<string>(localStorage.getItem('prefModel') ?? '')
export const transparencyModeAtom = atom<boolean>(String(localStorage.getItem('transparencyMode')) === 'true')
export const languageAtom = atom<string>("") // this is more of just a notifier, and the default value does not matter since the re-render happens on change
