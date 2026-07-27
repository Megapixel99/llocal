/**
 * Pairing routes — make it easy (and safe) to point the mobile/web app at this
 * server without hand-typing a long token.
 *
 *   GET  /pairing         → the current pairing payload + reachable LAN URLs.
 *   POST /pairing/rotate  → mint a fresh strong token, persist it, return the
 *                           new payload. The OLD token stops working immediately.
 *
 * Both are behind the bearer token (registered under requireToken in index.ts).
 * The pairing payload is built with the shared, unit-tested core in
 * src/shared/pairing.ts — no encoding logic is duplicated here.
 */
import { Router } from 'express'
import os from 'os'
import { randomBytes } from 'crypto'
import { config } from './config.ts'
import { getCurrentToken, setToken } from './token-store.ts'
import {
  generatePairingToken,
  encodePairingPayload,
  buildCandidateUrls,
  PAIRING_VERSION
} from '../../src/shared/pairing.ts'

/** Every non-internal IPv4 address of this host (the ones a phone on the LAN can reach). */
function lanHosts(): string[] {
  const hosts: string[] = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      // Node <18 uses the string 'IPv4'; Node 18+ may use the number 4.
      const isV4 = info.family === 'IPv4' || (info.family as unknown) === 4
      if (isV4 && !info.internal) hosts.push(info.address)
    }
  }
  return hosts
}

const EXEC_WARNING =
  '/exec is ENABLED: anyone with this token can run commands as the server user. ' +
  'Keep the server on a trusted LAN or VPN (Tailscale/WireGuard) only, and restrict ' +
  'commands with LLOCAL_EXEC_ALLOWLIST.'

interface PairingResponse {
  /** Compact base64url payload to paste/scan into the app. */
  payload: string
  /** The base URL embedded in the payload (first reachable LAN URL). */
  serverUrl: string
  /** All candidate LAN URLs, so the user can pick the reachable one. */
  candidateUrls: string[]
  /** Raw LAN hosts detected on this machine. */
  hosts: string[]
  port: number
  version: string
  execEnabled: boolean
  /** Present and loud only when /exec is on. */
  execWarning?: string
}

function buildPairingResponse(): PairingResponse {
  const token = getCurrentToken()
  const hosts = lanHosts()
  const candidateUrls = buildCandidateUrls(hosts.length ? hosts : ['127.0.0.1'], config.port)
  const serverUrl = candidateUrls[0] ?? `http://127.0.0.1:${config.port}`
  const payload = encodePairingPayload({ serverUrl, token, version: PAIRING_VERSION })
  return {
    payload,
    serverUrl,
    candidateUrls,
    hosts,
    port: config.port,
    version: PAIRING_VERSION,
    execEnabled: config.execEnabled,
    ...(config.execEnabled ? { execWarning: EXEC_WARNING } : {})
  }
}

export const pairingRouter = Router()

// Show the current pairing payload (does not change the token).
pairingRouter.get('/', (_req, res) => {
  res.json(buildPairingResponse())
})

// Rotate the bearer token, then return the fresh pairing payload.
pairingRouter.post('/rotate', (_req, res) => {
  try {
    const token = generatePairingToken((n) => randomBytes(n))
    setToken(token)
    res.json(buildPairingResponse())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
