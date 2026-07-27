// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout } from '../src/renderer/src/platform/serverClient'

afterEach(() => vi.unstubAllGlobals())

/**
 * The mobile "Test server" button hung with no success/error when a host/port silently dropped
 * packets, because fetch() has no timeout. fetchWithTimeout must turn that hang into a clear error.
 */
describe('fetchWithTimeout', () => {
  it('rejects with a clear "timed out" message when the request hangs past the deadline', async () => {
    // A fetch that never resolves on its own, but honours the abort signal like the real one.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
    )
    await expect(fetchWithTimeout('http://unreachable/health', {}, 20)).rejects.toThrow(/timed out/)
  })

  it('returns the response when fetch resolves before the deadline', async () => {
    const res = new Response('ok')
    vi.stubGlobal('fetch', () => Promise.resolve(res))
    await expect(fetchWithTimeout('http://ok/health', {}, 1000)).resolves.toBe(res)
  })

  it('propagates non-timeout fetch errors unchanged', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Load failed')))
    await expect(fetchWithTimeout('http://x/health', {}, 1000)).rejects.toThrow('Load failed')
  })
})
