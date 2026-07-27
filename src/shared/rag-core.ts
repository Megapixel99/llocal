/**
 * Platform-agnostic RAG (retrieval-augmented generation) core.
 *
 * This is the single source of truth for the knowledge-base logic. It has no
 * Electron dependency, so it is consumed by BOTH:
 *   - the Electron main process (src/main/utils/rag-utils.ts wraps it), and
 *   - the companion server (server/src/rag.ts wraps it),
 * which is how we avoid duplicating the embedding / indexing / reranking code.
 *
 * Callers inject the storage directory and the Ollama base URL instead of the
 * values being hardcoded, so the same code runs against a local Ollama on the
 * desktop and a co-located Ollama on the companion server.
 */
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import { existsSync, readdirSync, rmSync } from 'fs'
import path from 'path'

export interface AddKnowledgeType {
  path: string
  fileName: string
}

export interface RagReturn {
  prompt: string
  sources: string
}

interface ScoredDocument extends Document {
  score: number
}

export const DEFAULT_EMBEDDING_MODEL = 'all-minilm'

export const getFileName = (dir: string): string => path.basename(dir)

function makeEmbeddings(ollamaBaseUrl: string): OllamaEmbeddings {
  return new OllamaEmbeddings({ baseUrl: ollamaBaseUrl, model: DEFAULT_EMBEDDING_MODEL })
}

/** Embed + index the given documents into a Faiss store on disk. */
export const saveVectorDb = async (
  docs: Document[],
  saveDirectory: string,
  ollamaBaseUrl: string
): Promise<boolean> => {
  const embeddings = makeEmbeddings(ollamaBaseUrl)
  const textSplitter = new RecursiveCharacterTextSplitter()
  try {
    const splits = await textSplitter.splitDocuments(docs)
    const vectorstore = await FaissStore.fromDocuments(splits, embeddings)
    await vectorstore.save(saveDirectory)
    return true
  } catch (error) {
    console.error('Error saving vector database:', error)
    return false
  }
}

/** List the knowledge-base vector DBs stored under `baseDir`. */
export const getVectorDbList = (baseDir: string): AddKnowledgeType[] => {
  // The Knowledge Base folder doesn't exist until the first document is added.
  if (!existsSync(baseDir)) return []
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((dirEntry) => dirEntry.isDirectory())
    .map((dirEntry) => ({
      path: path.join(baseDir, dirEntry.name),
      fileName: dirEntry.name
    }))
}

const generateSources = (similaritySearchResults: Document[]): string => {
  let sources = '\n Sources: \n'
  sources += '| Database | Location |\n |------|------| \n'
  similaritySearchResults.forEach((val) => {
    const splits = val.metadata.dbName.split('.')
    const fileType = splits[splits.length - 1]
    if (fileType === 'pdf') {
      const dbName = val.metadata.dbName || 'Unknown'
      sources += `| ${dbName} | Page: ${val.metadata.loc.pageNumber} (${val.metadata.loc.lines.from} to ${val.metadata.loc.lines.to}) | \n`
    } else if (fileType === 'csv') {
      const dbName = val.metadata.dbName || 'Unknown'
      sources += `| ${dbName} | Line: ${val.metadata.line} | \n`
    } else {
      const dbName = val.metadata.dbName || 'Unknown'
      sources += `| ${dbName} | Line: ${val.metadata.loc.lines.from} to ${val.metadata.loc.lines.to} | \n`
    }
  })
  return sources
}

// Optimized BM25 reranking function.
export const bm25Rerank = (
  results: Document[],
  query: string,
  k1 = 1.5,
  b = 0.75
): ScoredDocument[] => {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1)
  const docCount = results.length
  const avgDocLength = results.reduce((sum, r) => sum + r.pageContent.length, 0) / docCount

  const idfScores = new Map<string, number>()
  queryTerms.forEach((term) => {
    const docsWithTerm = results.filter((r) => r.pageContent.toLowerCase().includes(term)).length
    const idf = Math.log((docCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5))
    idfScores.set(term, idf)
  })

  const queryRegex = new RegExp(queryTerms.join('|'), 'gi')

  const scoredResults: ScoredDocument[] = results.map((result) => {
    const content = result.pageContent.toLowerCase()
    const termFrequencies = new Map<string, number>()

    let match: RegExpExecArray | null
    while ((match = queryRegex.exec(content)) !== null) {
      const term = match[0].toLowerCase()
      termFrequencies.set(term, (termFrequencies.get(term) || 0) + 1)
    }

    let score = 0
    queryTerms.forEach((term) => {
      const tf = termFrequencies.get(term) || 0
      const idf = idfScores.get(term) || 0
      const numerator = tf * (k1 + 1)
      const denominator = tf + k1 * (1 - b + b * (content.length / avgDocLength))
      score += idf * (numerator / denominator)
    })
    return { ...result, score } as ScoredDocument
  })

  return scoredResults.sort((a, b) => b.score - a.score)
}

/** Run similarity search + BM25 rerank across the selected vector DBs. */
export const similaritySearch = async (
  selectedKnowledge: AddKnowledgeType[],
  prompt: string,
  ollamaBaseUrl: string
): Promise<RagReturn> => {
  const embeddings = makeEmbeddings(ollamaBaseUrl)
  const allResults = await Promise.all(
    selectedKnowledge.map(async (db) => {
      const vectorstore = await FaissStore.load(db.path, embeddings)
      const results = await vectorstore.similaritySearch(prompt)
      return results.map((result) => ({
        ...result,
        metadata: { ...result.metadata, dbName: db.fileName }
      }))
    })
  ).then((results) => results.flat())

  const rerankedResults = bm25Rerank(allResults, prompt)
  const sources = generateSources(rerankedResults)

  return {
    prompt: `QUESTION:  ${prompt},\n
    Answer the question as accurate as possible from the provided context, make sure to provide all the details, if the answer is not in
    provided context just say, "answer is not available in the context", don't provide the wrong answer: \n
    CONTEXT : ${JSON.stringify(rerankedResults)}`,
    sources
  }
}

export function deleteVectorDb(indexPath: string): boolean {
  rmSync(indexPath, { recursive: true, force: true })
  return true
}
