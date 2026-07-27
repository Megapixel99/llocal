/**
 * Web search / URL scrape route.
 *
 * Plain queries reuse the existing `webSearch` (src/main/websearch.ts). URL
 * scraping is reimplemented here with a fetch-based fetcher instead of the
 * desktop app's hidden-Electron-window scraper (which has no server equivalent),
 * but keeps the same turndown → split → embed → rerank pipeline.
 */
import { Router } from 'express'
import TurndownService from 'turndown'
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from '@langchain/core/documents'
import { config } from './config.ts'
import { webSearch } from '../../src/main/websearch.ts'

async function loadWebsite(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LLocalServer/0.1)' }
  })
  return await res.text()
}

async function scrapeAndSearch(
  query: string,
  url: string
): Promise<{ prompt: string; sources: string }> {
  const html = await loadWebsite(url)
  const turndown = new TurndownService()
  turndown.remove(['head', 'script', 'style', 'img', 'video'])
  const markdown = turndown.turndown(html)

  const docs = [new Document({ pageContent: markdown, metadata: { source: url } })]
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 })
  const splits = await splitter.splitDocuments(docs)

  const embeddings = new OllamaEmbeddings({ baseUrl: config.ollamaUrl, model: 'all-minilm' })
  const store = await MemoryVectorStore.fromDocuments(splits, embeddings)
  const results = await store.similaritySearch(query)

  return {
    prompt: `this is my question : ${query} \n answer from the context below: \n ${JSON.stringify(results)}`,
    sources: `\n[Source](${url})`
  }
}

export const websearchRouter = Router()

websearchRouter.post('/', async (req, res) => {
  try {
    const { query, links } = req.body as { query: string; links?: string[] }
    let stripped = query
    if (links && links.length > 0) {
      for (const link of links) stripped = stripped.replace(link, '')
      const result = await scrapeAndSearch(stripped.trim(), links[0])
      return res.json(result)
    }
    const result = await webSearch(query)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
