import { describe, it, expect } from 'vitest'
import {
  generatePairingToken,
  encodePairingPayload,
  parsePairingPayload,
  buildCandidateUrls,
  PAIRING_TOKEN_BYTES,
  PAIRING_VERSION,
  type PairingPayload
} from '../src/shared/pairing'

/** Deterministic RNG: fills n bytes with a repeating counter so tests are stable. */
function seededRandomBytes(seed = 0): (n: number) => Uint8Array {
  return (n: number) => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) out[i] = (seed + i) & 0xff
    return out
  }
}

describe('generatePairingToken', () => {
  it('produces a URL-safe base64url token', () => {
    const token = generatePairingToken(seededRandomBytes(1))
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).not.toMatch(/[+/=]/)
  })

  it('encodes the default byte length (32 bytes → 43 base64url chars)', () => {
    const token = generatePairingToken(seededRandomBytes(0))
    // ceil(32 * 8 / 6) = 43 chars, unpadded.
    expect(token).toHaveLength(43)
    expect(PAIRING_TOKEN_BYTES).toBe(32)
  })

  it('is deterministic for a deterministic RNG', () => {
    expect(generatePairingToken(seededRandomBytes(5))).toBe(generatePairingToken(seededRandomBytes(5)))
  })

  it('differs when the random bytes differ', () => {
    expect(generatePairingToken(seededRandomBytes(1))).not.toBe(generatePairingToken(seededRandomBytes(2)))
  })

  it('honors a custom byte length', () => {
    const token = generatePairingToken(seededRandomBytes(0), 16)
    // ceil(16 * 8 / 6) = 22 chars.
    expect(token).toHaveLength(22)
  })

  it('accepts a plain number[] from the RNG', () => {
    const token = generatePairingToken(() => [1, 2, 3], 3)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects a non-positive byte length', () => {
    expect(() => generatePairingToken(seededRandomBytes(0), 0)).toThrow()
  })
})

describe('encode/parse round-trip', () => {
  const payload: PairingPayload = {
    serverUrl: 'http://192.168.1.10:8787',
    token: generatePairingToken(seededRandomBytes(7)),
    version: PAIRING_VERSION
  }

  it('round-trips a valid payload', () => {
    const encoded = encodePairingPayload(payload)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(parsePairingPayload(encoded)).toEqual(payload)
  })

  it('produces a compact string (uses short JSON keys)', () => {
    const encoded = encodePairingPayload(payload)
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    )
    expect(decoded).toContain('"u":')
    expect(decoded).toContain('"t":')
    expect(decoded).toContain('"v":')
    expect(decoded).not.toContain('serverUrl')
  })

  it('round-trips an https URL', () => {
    const p: PairingPayload = { serverUrl: 'https://host.tailnet.ts.net', token: 'abc', version: '1' }
    expect(parsePairingPayload(encodePairingPayload(p))).toEqual(p)
  })

  it('tolerates copy-paste padding / standard base64 chars', () => {
    const encoded = encodePairingPayload(payload)
    expect(parsePairingPayload(`${encoded}==`)).toEqual(payload)
  })
})

describe('encodePairingPayload validation', () => {
  it('rejects a non-http(s) URL', () => {
    expect(() => encodePairingPayload({ serverUrl: 'ftp://x', token: 't', version: '1' })).toThrow()
  })

  it('rejects an empty token', () => {
    expect(() =>
      encodePairingPayload({ serverUrl: 'http://x:1', token: '   ', version: '1' })
    ).toThrow()
  })

  it('rejects a missing version', () => {
    expect(() =>
      encodePairingPayload({ serverUrl: 'http://x:1', token: 't', version: '' })
    ).toThrow()
  })
})

describe('parsePairingPayload rejects bad input', () => {
  it('rejects an empty string', () => {
    expect(() => parsePairingPayload('')).toThrow(/empty/i)
  })

  it('rejects whitespace only', () => {
    expect(() => parsePairingPayload('   ')).toThrow(/empty/i)
  })

  it('rejects non-base64url characters', () => {
    expect(() => parsePairingPayload('not valid!!! payload')).toThrow()
  })

  it('rejects base64url that is not JSON', () => {
    // "hello world" encoded is valid base64url but not JSON.
    const encoded = generatePairingToken(() => new TextEncoder().encode('hello world'), 11)
    expect(() => parsePairingPayload(encoded)).toThrow(/JSON/i)
  })

  it('rejects JSON that is missing the token', () => {
    const bad = new TextEncoder().encode(JSON.stringify({ u: 'http://x:1', v: '1' }))
    const encoded = generatePairingToken(() => bad, bad.length)
    expect(() => parsePairingPayload(encoded)).toThrow(/token/i)
  })

  it('rejects JSON with a bad server URL', () => {
    const bad = new TextEncoder().encode(JSON.stringify({ u: 'nonsense', t: 'tok', v: '1' }))
    const encoded = generatePairingToken(() => bad, bad.length)
    expect(() => parsePairingPayload(encoded)).toThrow(/URL/i)
  })
})

describe('buildCandidateUrls', () => {
  it('builds a single URL from a host + port', () => {
    expect(buildCandidateUrls('192.168.1.10', 8787)).toEqual(['http://192.168.1.10:8787'])
  })

  it('builds URLs for a list of hosts, preserving order', () => {
    expect(buildCandidateUrls(['10.0.0.2', '192.168.1.5'], 8787)).toEqual([
      'http://10.0.0.2:8787',
      'http://192.168.1.5:8787'
    ])
  })

  it('strips an accidental protocol and trailing path', () => {
    expect(buildCandidateUrls('http://192.168.1.10/foo', 8787)).toEqual(['http://192.168.1.10:8787'])
  })

  it('brackets bare IPv6 literals', () => {
    expect(buildCandidateUrls('fe80::1', 8787)).toEqual(['http://[fe80::1]:8787'])
  })

  it('leaves already-bracketed IPv6 literals alone', () => {
    expect(buildCandidateUrls('[fe80::1]', 8787)).toEqual(['http://[fe80::1]:8787'])
  })

  it('drops blanks and de-duplicates', () => {
    expect(buildCandidateUrls(['10.0.0.2', '', '  ', '10.0.0.2'], 8787)).toEqual([
      'http://10.0.0.2:8787'
    ])
  })

  it('returns an empty array for no usable hosts', () => {
    expect(buildCandidateUrls([], 8787)).toEqual([])
  })
})
