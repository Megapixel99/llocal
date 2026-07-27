import 'dotenv/config'
import os from 'os'
import path from 'path'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[llocal-server] Missing required env var ${name}. See server/.env.example.`)
    process.exit(1)
  }
  return value
}

const dataDir =
  process.env.LLOCAL_DATA_DIR && process.env.LLOCAL_DATA_DIR.trim().length > 0
    ? process.env.LLOCAL_DATA_DIR
    : path.join(os.homedir(), '.llocal-server')

export const config = {
  port: Number(process.env.PORT ?? 8787),
  token: required('LLOCAL_SERVER_TOKEN'),
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
  dataDir,
  knowledgeBaseDir: path.join(dataDir, 'knowledge-base'),
  reposDir: path.join(dataDir, 'repos'),
  uploadsDir: path.join(dataDir, 'uploads'),
  ttsCacheDir: path.join(dataDir, 'hf-cache'),
  corsOrigin: process.env.LLOCAL_CORS_ORIGIN ?? '*',
  execEnabled: process.env.LLOCAL_ENABLE_EXEC === '1',
  execAllowlist: (process.env.LLOCAL_EXEC_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  githubToken: process.env.GITHUB_TOKEN ?? ''
}

export type Config = typeof config
