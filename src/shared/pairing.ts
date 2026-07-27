/**
 * Platform-agnostic mobile-pairing core.
 *
 * The companion server and the mobile/web app need to agree on two things:
 * a base URL and a bearer token. Rather than have the user type a long random
 * token by hand, we encode {serverUrl, token, version} into a single compact,
 * URL-safe string (a "pairing payload") that can be copied, linked, or shown as
 * a QR code and pasted/scanned on the phone.
 *
 * Like src/shared/commands.ts and src/shared/rag-core.ts, this module has NO
 * Electron, DOM, or Node dependency — it is pure string/byte logic so it can be
 * shared by:
 *   - the companion server (server/src/pairing.ts generates the payload), and
 *   - the renderer / mobile app (parses a pasted payload into config).
 *
 * Randomness is INJECTED (see generatePairingToken) so the core stays pure and
 * unit-testable; callers pass crypto.randomBytes (Node) or crypto.getRandomValues
 * (browser). Nothing here calls Math.random or Date.now.
 */

/** The decoded, validated contents of a pairing payload. */
export interface PairingPayload {
  /** Companion-server base URL, e.g. "http://192.168.1.10:8787". */
  serverUrl: string
  /** Bearer token shared with the companion server. */
  token: string
  /** Payload schema/app version, for forward-compatibility. */
  version: string
}

// URL-safe base64 alphabet (RFC 4648 §5). No padding, no '+' or '/'.
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Encode raw bytes as an unpadded base64url string (pure, no Buffer/atob). */
function bytesToBase64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64URL[b0 >> 2]
    out += B64URL[((b0 & 0x03) << 4) | (b1 >> 4)]
    if (i + 1 < bytes.length) out += B64URL[((b1 & 0x0f) << 2) | (b2 >> 6)]
    if (i + 2 < bytes.length) out += B64URL[b2 & 0x3f]
  }
  return out
}

// Reverse lookup for decoding, built once.
const B64URL_LOOKUP: Record<string, number> = (() => {
  const m: Record<string, number> = {}
  for (let i = 0; i < B64URL.length; i++) m[B64URL[i]] = i
  return m
})()

/** Decode an unpadded base64url string back to bytes. Throws on invalid input. */
function base64urlToBytes(str: string): Uint8Array {
  // Tolerate accidental standard-base64 padding / chars from copy-paste.
  const clean = str.trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  if (clean.length === 0) throw new Error('Empty payload')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const v = B64URL_LOOKUP[ch]
    if (v === undefined) throw new Error('Payload is not valid base64url')
    value = (value << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((value >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

/** A source of cryptographically-strong random bytes, injected by the caller. */
export type RandomBytes = (n: number) => Uint8Array | number[]

/** Default token length in bytes (32 bytes → 43 base64url chars ≈ 256 bits). */
export const PAIRING_TOKEN_BYTES = 32

/** Current pairing-payload schema version. */
export const PAIRING_VERSION = '1'

/**
 * Generate a strong, URL-safe bearer token.
 *
 * The RNG is injected so this function is pure and deterministic under test —
 * pass `(n) => crypto.randomBytes(n)` on Node or a getRandomValues wrapper in a
 * browser. The result is base64url (matches [A-Za-z0-9_-]+) so it survives URLs,
 * headers, and env files without escaping.
 */
export function generatePairingToken(
  randomBytes: RandomBytes,
  byteLength: number = PAIRING_TOKEN_BYTES
): string {
  if (byteLength <= 0) throw new Error('byteLength must be positive')
  const raw = randomBytes(byteLength)
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw)
  if (bytes.length === 0) throw new Error('randomBytes returned no data')
  return bytesToBase64url(bytes)
}

function isValidHttpUrl(candidate: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/** Validate a payload's fields, throwing a descriptive error on the first problem. */
function assertValidPayload(p: Partial<PairingPayload>): asserts p is PairingPayload {
  if (!p || typeof p !== 'object') throw new Error('Pairing payload must be an object')
  if (typeof p.serverUrl !== 'string' || !isValidHttpUrl(p.serverUrl)) {
    throw new Error('Pairing payload has an invalid server URL')
  }
  if (typeof p.token !== 'string' || p.token.trim().length === 0) {
    throw new Error('Pairing payload is missing a token')
  }
  if (typeof p.version !== 'string' || p.version.trim().length === 0) {
    throw new Error('Pairing payload is missing a version')
  }
}

/**
 * Encode a validated {serverUrl, token, version} into a compact base64url string.
 * Uses short JSON keys (u/t/v) to keep the payload — and any QR code — small.
 */
export function encodePairingPayload(payload: PairingPayload): string {
  assertValidPayload(payload)
  const json = JSON.stringify({
    u: payload.serverUrl,
    t: payload.token,
    v: payload.version
  })
  return bytesToBase64url(new TextEncoder().encode(json))
}

/**
 * Parse and validate a pairing payload string produced by encodePairingPayload.
 * Throws an Error with a human-readable message if the string is malformed,
 * empty, not valid JSON, or fails field validation.
 */
export function parsePairingPayload(input: string): PairingPayload {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('Pairing payload is empty')
  }
  const bytes = base64urlToBytes(input)
  let obj: unknown
  try {
    obj = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('Pairing payload is not valid JSON')
  }
  if (!obj || typeof obj !== 'object') throw new Error('Pairing payload is not an object')
  const record = obj as Record<string, unknown>
  const candidate: Partial<PairingPayload> = {
    serverUrl: record.u as string,
    token: record.t as string,
    version: record.v as string
  }
  assertValidPayload(candidate)
  return candidate
}

/**
 * Build candidate LAN URLs for reaching the companion server.
 *
 * `hosts` may be a single host (IP or hostname) or a list (e.g. every non-internal
 * IPv4 address from os.networkInterfaces). Each is normalized — protocol/trailing
 * slash stripped, IPv6 literals bracketed — and combined with the port into an
 * http:// URL. Duplicates and blanks are dropped, order preserved.
 */
export function buildCandidateUrls(hosts: string | string[], port: number): string[] {
  const list = Array.isArray(hosts) ? hosts : [hosts]
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    let host = raw.trim()
    if (host.length === 0) continue
    // Strip any protocol the caller accidentally included.
    host = host.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    // Strip a trailing slash / path.
    host = host.replace(/\/.*$/, '')
    if (host.length === 0) continue
    // Bracket bare IPv6 literals (contain ':' and aren't already bracketed).
    const isBracketed = host.startsWith('[') && host.endsWith(']')
    if (!isBracketed && host.indexOf(':') !== -1) host = `[${host}]`
    const url = `http://${host}:${port}`
    if (!seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}
