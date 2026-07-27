import { contextBridge, ipcRenderer } from 'electron'
// import { electronAPI } from '@electron-toolkit/preload'

interface webSearchType {
  prompt: string
  sources: string
}

// Custom APIs for renderer
const api = {
  checkingOllama: (): Promise<boolean> => ipcRenderer.invoke('checkingOllama'),
  checkingBinaries: (): Promise<boolean> => ipcRenderer.invoke('checkingBinaries'),
  checkingBinarySize: (): Promise<boolean> => ipcRenderer.invoke('checkingBinarySize'),
  downloadingOllama: (): Promise<string> => ipcRenderer.invoke('downloadingOllama'),
  installingOllama: (): Promise<boolean> => ipcRenderer.invoke('installingOllama'),
  checkVersion: (): Promise<string> => ipcRenderer.invoke('checkVersion'),
  checkPlatform: (): Promise<string> => ipcRenderer.invoke('checkPlatform'),
  experimentalSearch: (searchQuery: string, links: string[]): Promise<webSearchType> => ipcRenderer.invoke('experimentalSearch', searchQuery, links),
  addKnowledge: (file?: string): Promise<addKnowledgeType> => ipcRenderer.invoke('addKnowledge', file),
  addKnowledgeFolder: (): Promise<{ folder: string; added: addKnowledgeType[] }> => ipcRenderer.invoke('addKnowledgeFolder'),
  selectFolder: (): Promise<string> => ipcRenderer.invoke('selectFolder'),
  getGitCapabilities: (): Promise<gitCapabilities> => ipcRenderer.invoke('getGitCapabilities'),
  getGitInfo: (folder: string): Promise<gitInfo> => ipcRenderer.invoke('getGitInfo', folder),
  listWorktrees: (folder: string): Promise<worktree[]> => ipcRenderer.invoke('listWorktrees', folder),
  createWorktree: (folder: string, name: string): Promise<string> => ipcRenderer.invoke('createWorktree', folder, name),
  createPullRequest: (folder: string, title: string, body: string): Promise<string> => ipcRenderer.invoke('createPullRequest', folder, title, body),
  getAgentTools: (): Promise<{ tools: object[]; mutating: string[] }> => ipcRenderer.invoke('getAgentTools'),
  runAgentTool: (root: string, name: string, args: object): Promise<string> => ipcRenderer.invoke('runAgentTool', root, name, args),
  similaritySearch: (chosenVectorDbsPath: addKnowledgeType[], prompt: string): Promise<ragReturn> => ipcRenderer.invoke('similaritySearch', chosenVectorDbsPath, prompt),
  getVectorDbList: (): Promise<addKnowledgeType[]> => ipcRenderer.invoke('getVectorDbList'),
  listCommands: (): Promise<commandType[]> => ipcRenderer.invoke('listCommands'),
  deleteVectorDb: (indexPath: string): Promise<boolean> => ipcRenderer.invoke('deleteVectorDb', indexPath),
  translate: (key: string, options: object): string => ipcRenderer.sendSync('translate', key, options),
  changeLanguage: (language: string): Promise<boolean> => ipcRenderer.invoke('changeLanguage', language),
  getLanguages: (): Promise<readonly string[]> => ipcRenderer.invoke('getLanguages'),
  titleBar: (event: string): void => ipcRenderer.send('titleBar', event),
  textToSpeech: (text: string): Promise<ArrayBuffer> => ipcRenderer.invoke('textToSpeech', text),
  // ---- Interactive terminal ----
  startTerminal: (opts: { command: string; cwd?: string }): Promise<string> => ipcRenderer.invoke('terminal:start', opts),
  sendTerminalInput: (sessionId: string, data: string): Promise<boolean> => ipcRenderer.invoke('terminal:input', { sessionId, data }),
  killTerminal: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('terminal:kill', { sessionId }),
  // Event subscriptions — each returns an unsubscribe function.
  onTerminalData: (callback: (payload: { sessionId: string; chunk: string }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { sessionId: string; chunk: string }): void => callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (callback: (payload: { sessionId: string; code: number | null }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { sessionId: string; code: number | null }): void => callback(payload)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  }
}


// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled in the browserwindow')
}
try {
  // this does not work for some reason
  // contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
