/**
 * LLocal companion server.
 *
 * Runs on the machine hosting Ollama and exposes the capabilities a phone can't
 * run itself: RAG, web search, TTS, Git operations against an external repo, and
 * (optionally) command execution on the host. Everything except /health is
 * protected by a shared bearer token.
 */
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import { config } from './config.ts'
import { requireToken } from './auth.ts'
import { ragRouter } from './rag.ts'
import { websearchRouter } from './websearch.ts'
import { ttsRouter } from './tts.ts'
import { gitRouter } from './git.ts'
import { execRouter } from './exec.ts'
import { commandsRouter } from './commands.ts'
import { pairingRouter } from './pairing.ts'
import { ollamaProxyRouter } from './ollama-proxy.ts'

const app = express()
app.use(cors({ origin: config.corsOrigin }))

// Ensure the data directories exist up front.
for (const dir of [config.dataDir, config.knowledgeBaseDir, config.reposDir, config.uploadsDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

// Health check — unauthenticated so the app can probe reachability.
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0', execEnabled: config.execEnabled })
})

// Ollama proxy must run before the JSON body parser so bodies stream through.
app.use('/ollama', requireToken, ollamaProxyRouter)

// Body parsers for the JSON APIs.
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true }))

// Everything below requires the token.
app.use(requireToken)
app.use('/rag', ragRouter)
app.use('/websearch', websearchRouter)
app.use('/tts', ttsRouter)
app.use('/git', gitRouter)
app.use('/exec', execRouter)
app.use('/commands', commandsRouter)
app.use('/pairing', pairingRouter)

app.listen(config.port, () => {
  console.log(`[llocal-server] listening on :${config.port}`)
  console.log(`[llocal-server] ollama: ${config.ollamaUrl}`)
  console.log(`[llocal-server] data dir: ${config.dataDir}`)
  console.log(`[llocal-server] exec: ${config.execEnabled ? 'ENABLED' : 'disabled'}`)
})
