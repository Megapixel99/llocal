import { ElectronAPI } from '@electron-toolkit/preload'

interface webSearchType {
  prompt: string
  sources: string
}

interface addKnowledgeType {
  // status: boolean
  path: string
  fileName: string
}

interface ragReturn {
  prompt: string
  sources: string
}

interface commandType {
  name: string
  namespace: string
  description: string
  argumentHint: string
  model: string
  allowedTools: string
  body: string
  source: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      checkingOllama: () => Promise<boolean>,
      checkingBinaries: () => Promise<boolean>,
      checkingBinarySize: () => Promise<boolean>,
      downloadingOllama: () => Promise<string>,
      installingOllama: () => Promise<boolean>,
      checkVersion: () => Promise<string>,
      checkPlatform: () => Promise<string>,
      experimentalSearch: (searchQuery: string, links: string[]) => Promise<webSearchType>,
      addKnowledge: (file?: string) => Promise<addKnowledgeType>,
      addKnowledgeFolder: () => Promise<{ folder: string; added: addKnowledgeType[] }>,
      selectFolder: () => Promise<string>,
      getGitCapabilities: () => Promise<gitCapabilities>,
      getGitInfo: (folder: string) => Promise<gitInfo>,
      listWorktrees: (folder: string) => Promise<worktree[]>,
      createWorktree: (folder: string, name: string) => Promise<string>,
      createPullRequest: (folder: string, title: string, body: string) => Promise<string>,
      getAgentTools: () => Promise<{ tools: object[]; mutating: string[] }>,
      runAgentTool: (root: string, name: string, args: object) => Promise<string>,
      similaritySearch: (selectedKnowledge: addKnowledgeType[], prompt: string) => Promise<ragReturn>,
      getVectorDbList: () => Promise<addKnowledgeType[]>,
      listCommands: () => Promise<commandType[]>,
      deleteVectorDb: (indexPath: string) => Promise<boolean>,
      translate: (key: string, options: object) => string,
      changeLanguage: (language: string) => Promise<boolean>,
      getLanguages: () => Promise<readonly string[]>,
      titleBar: (event: string) => void,
      textToSpeech: (text: string) => Promise<ArrayBuffer>,
      startTerminal: (opts: { command: string; cwd?: string }) => Promise<string>,
      sendTerminalInput: (sessionId: string, data: string) => Promise<boolean>,
      killTerminal: (sessionId: string) => Promise<boolean>,
      onTerminalData: (callback: (payload: { sessionId: string; chunk: string }) => void) => () => void,
      onTerminalExit: (callback: (payload: { sessionId: string; code: number | null }) => void) => () => void
    }
  }
}
