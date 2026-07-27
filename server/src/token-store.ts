/**
 * Mutable bearer-token store.
 *
 * The server boots with LLOCAL_SERVER_TOKEN from the environment (see config.ts),
 * but the pairing flow lets the user ROTATE the token from the app without editing
 * .env and restarting. A rotated token is persisted to a 0600 file in the data dir
 * so it survives restarts and takes precedence over the env value.
 *
 * auth.ts checks against getCurrentToken(), so rotation takes effect immediately
 * for every subsequent request.
 */
import fs from 'fs'
import path from 'path'
import { config } from './config.ts'

const tokenFile = path.join(config.dataDir, 'server-token')

let cached: string | null = null

/** Return the active token: a persisted rotated token if present, else the env token. */
export function getCurrentToken(): string {
  if (cached !== null) return cached
  try {
    if (fs.existsSync(tokenFile)) {
      const persisted = fs.readFileSync(tokenFile, 'utf8').trim()
      if (persisted) {
        cached = persisted
        return cached
      }
    }
  } catch {
    // fall through to the env token
  }
  cached = config.token
  return cached
}

/** Persist and activate a new token (0600 so only the server's user can read it). */
export function setToken(token: string): void {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('Refusing to set an empty token')
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true })
  fs.writeFileSync(tokenFile, trimmed, { mode: 0o600 })
  cached = trimmed
}
