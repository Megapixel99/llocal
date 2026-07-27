/**
 * Knowledge-base (RAG) routes.
 *
 * Reuses the shared RAG core (src/shared/rag-core.ts) and the existing document
 * loaders (src/main/utils/docs-generator.ts) — no logic is duplicated here. The
 * server just provides HTTP + storage-on-the-host glue so a phone can upload a
 * document and have it embedded/indexed on the Ollama host.
 */
import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { config } from './config.ts'
import {
  deleteVectorDb,
  getFileName,
  getVectorDbList,
  saveVectorDb,
  similaritySearch,
  type AddKnowledgeType
} from '../../src/shared/rag-core.ts'
import { generateDocs } from '../../src/main/utils/docs-generator.ts'

const upload = multer({ dest: config.uploadsDir })

export const ragRouter = Router()

function ensureDirs(): void {
  for (const dir of [config.knowledgeBaseDir, config.uploadsDir, config.reposDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Ingest a file into the knowledge base.
 * - multipart upload (field "file"), or
 * - { repoPath } relative to LLOCAL_DATA_DIR/repos (a file already on the host).
 */
ragRouter.post('/add', upload.single('file'), async (req, res) => {
  ensureDirs()
  try {
    let sourcePath: string
    let originalName: string

    if (req.file) {
      // multer stores under a random name; rename to keep the real extension so
      // generateDocs picks the right loader.
      originalName = req.file.originalname
      sourcePath = path.join(config.uploadsDir, originalName)
      fs.renameSync(req.file.path, sourcePath)
    } else if (req.body?.repoPath) {
      // Guard against path traversal outside the repos dir.
      const resolved = path.resolve(config.reposDir, req.body.repoPath)
      if (!resolved.startsWith(path.resolve(config.reposDir))) {
        return res.status(400).json({ error: 'repoPath escapes repos directory' })
      }
      sourcePath = resolved
      originalName = getFileName(resolved)
    } else {
      return res.status(400).json({ error: 'Provide a file upload or repoPath' })
    }

    const fileName = getFileName(originalName)
    const docs = await generateDocs(sourcePath)
    if (!docs.length) {
      return res.status(415).json({ error: 'Unsupported or empty file' })
    }
    const dir = path.join(config.knowledgeBaseDir, fileName)
    const ok = await saveVectorDb(docs, dir, config.ollamaUrl)
    if (!ok) return res.status(500).json({ error: 'Failed to build vector DB' })

    const result: AddKnowledgeType = { path: dir, fileName }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

ragRouter.post('/similarity', async (req, res) => {
  try {
    const { selectedKnowledge, prompt } = req.body as {
      selectedKnowledge: AddKnowledgeType[]
      prompt: string
    }
    const result = await similaritySearch(selectedKnowledge, prompt, config.ollamaUrl)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

ragRouter.get('/list', (_req, res) => {
  ensureDirs()
  try {
    res.json(getVectorDbList(config.knowledgeBaseDir))
  } catch {
    res.json([])
  }
})

ragRouter.delete('/delete', (req, res) => {
  try {
    const { indexPath } = req.body as { indexPath: string }
    // Only allow deleting inside the knowledge-base dir.
    const resolved = path.resolve(indexPath)
    if (!resolved.startsWith(path.resolve(config.knowledgeBaseDir))) {
      return res.status(400).json({ error: 'Path outside knowledge base' })
    }
    deleteVectorDb(resolved)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
