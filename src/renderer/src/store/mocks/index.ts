import { listModels } from '@renderer/hooks/useOllama'
import type { Command } from '@renderer/utils/commands'
import type { MessageMetric } from '../../../../shared/analytics'
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
export const streamingAtom = atom<string>('') // Handling Streaming
export const generatingAtom = atom<boolean>(false) // True from when a prompt is sent until the response is complete (drives the thinking animation)
export const stopGeneratingAtom = atom<boolean>(false) // Handling the option to stop generating
export const imageAttatchmentAtom = atom<string>('') // Storing the base64 image
export const experimentalSearchAtom = atom<boolean>(false) // Toggle for websearch
export const fileContextAtom = atom<fileContext[]>([]) // For storing the current file for RAG
export const workingFolderAtom = atomWithStorage<string>('workingFolder', '') // Chosen working folder (like a project dir); persisted, enables git features when it's a repo
export type appTab = 'chat' | 'agent' // left-sidebar tabs: plain chat vs the coding agent
export const activeTabAtom = atomWithStorage<appTab>('activeTab', 'chat')
export type agentMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' // manual = approve every action; acceptEdits = auto-write files but confirm commands; plan = read-only; auto = run everything
export const agentModeAtom = atomWithStorage<agentMode>('agentMode', 'manual')
export const agentApprovalAtom = atom<{ tool: string; args: Record<string, unknown> } | null>(null) // pending mutating action awaiting user approval
export type Effort = 'low' | 'medium' | 'high' // controls how many searches DeepResearch runs
export const effortAtom = atomWithStorage<Effort>('researchEffort', 'medium')
export const knowledgeBaseAtom = atom<getVectorDb[]>([]) // For storing the list of vector db's
export const commandListAtom = atom<Command[]>([]) // Claude Code style slash commands (~/.claude/commands, bundled, etc.)
export const modelListAtom = atom<listModels[]>(JSON.parse(localStorage.getItem('modelList') || '[]') as listModels[]) // Storing List of Models in Local Storage
export const settingsToggleAtom = atom<boolean>(false)
export const isOllamaInstalledAtom = atom<boolean>(false)
export const suggestionsAtom = atom<suggestions>({ show: JSON.parse(localStorage.getItem('showSuggestions') || 'false'), prompts: [] })
export const fileDropAtom = atom<boolean>(false)
export const titleUpdateAtom = atom<number>(0)
export const contextUsageAtom = atom<{ used: number; total: number }>({ used: 0, total: 0 }) // tokens used vs the model's context window
export const sessionMetricsAtom = atom<MessageMetric[]>([]) // per-message token/throughput/tool metrics for the current session (in-memory; drives the analytics panel)

// User Preferences
const url = new URL('/src/assets/themes/galaxia.svg', import.meta.url).href
export const backgroundImageAtom = atom<string>(localStorage.getItem('bg') ?? url)
export const prefModelAtom = atom<string>(localStorage.getItem('prefModel') ?? '')
export const transparencyModeAtom = atom<boolean>(String(localStorage.getItem('transparencyMode')) === 'true')
export const languageAtom = atom<string>("") // this is more of just a notifier, and the default value does not matter since the re-render happens on change
