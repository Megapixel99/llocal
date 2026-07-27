/**
 * Electron main-process wrapper around the shared RAG core (src/shared/rag-core.ts).
 *
 * The heavy lifting (embedding, Faiss indexing, BM25 rerank) lives in the shared
 * module so the companion server can reuse it verbatim. This file only supplies
 * the Electron-specific bits: the native file picker and the local storage
 * directory / Ollama URL. Behavior for the desktop app is unchanged.
 */
import { dialog } from 'electron/main'
import path from 'path'
import { documentsDirectory } from '..'
import i18n from '../lib/localization/i18n'
import {
  AddKnowledgeType,
  RagReturn,
  deleteVectorDb as coreDeleteVectorDb,
  getFileName as coreGetFileName,
  getVectorDbList as coreGetVectorDbList,
  saveVectorDb as coreSaveVectorDb,
  similaritySearch as coreSimilaritySearch
} from '../../shared/rag-core'
import { Document } from '@langchain/core/documents'

interface GetFile {
  canceled: boolean
  filePaths: string[]
}

// The desktop app runs Ollama locally.
const LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434'
const knowledgeBaseDir = (): string => path.join(documentsDirectory, 'LLocal', 'Knowledge Base')

export const getFileName = coreGetFileName
const { t } = i18n

export async function getSelectedFiles(): Promise<GetFile> {
  return new Promise((resolve, reject) => {
    dialog
      .showOpenDialog({
        message: t('Choose files to add to the knowledge base'),
        filters: [
          { name: 'pdf, pptx, docx, txt, csv', extensions: ['pdf', 'pptx', 'docx', 'txt', 'csv'] }
        ]
      })
      .then((filePath): void => {
        if (filePath.canceled) reject(t('The operation has been aborted!'))
        resolve(filePath)
      })
  })
}

export const saveVectorDb = (docs: Document[], saveDirectory: string): Promise<boolean> =>
  coreSaveVectorDb(docs, saveDirectory, LOCAL_OLLAMA_URL)

export const getVectorDbList = (): AddKnowledgeType[] => coreGetVectorDbList(knowledgeBaseDir())

export const similaritySearch = (
  selectedKnowledge: AddKnowledgeType[],
  prompt: string
): Promise<RagReturn> => coreSimilaritySearch(selectedKnowledge, prompt, LOCAL_OLLAMA_URL)

export function deleteVectorDb(indexPath: string): boolean {
  return coreDeleteVectorDb(indexPath)
}
