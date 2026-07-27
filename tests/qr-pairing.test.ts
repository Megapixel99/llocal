import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { encodePairingPayload, parsePairingPayload, PAIRING_VERSION } from '../src/shared/pairing'

/**
 * Render a qrcode matrix into an RGBA pixel buffer (like a canvas ImageData) so jsQR can decode it —
 * scaled up with a white quiet zone, exactly what the on-screen QR + phone camera provide.
 */
function renderToPixels(text: string, scale = 6, quiet = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const modules = qr.modules.data // 1 = dark module
  const dim = (size + quiet * 2) * scale
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255) // start all white/opaque
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y * size + x]) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (quiet + x) * scale + dx
          const py = (quiet + y) * scale + dy
          const i = (py * dim + px) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
    }
  }
  return { data, width: dim, height: dim }
}

/**
 * The QR pairing feature just uses the QR as transport for the existing pairing payload. This proves
 * the whole pipeline: encode config → QR image → scan (jsQR) → parse → the same config back.
 */
describe('QR pairing round-trip', () => {
  it('config survives encode → QR → scan → parse', () => {
    const original = {
      serverUrl: 'http://192.168.1.22:8787',
      token: '67d1d5d907b1e3d455aa11bb22cc33dd',
      version: PAIRING_VERSION
    }
    const payload = encodePairingPayload(original)

    const img = renderToPixels(payload)
    const scanned = jsQR(img.data, img.width, img.height)

    expect(scanned?.data).toBe(payload) // the camera would read back the exact payload string
    const parsed = parsePairingPayload(scanned!.data)
    expect(parsed.serverUrl).toBe(original.serverUrl)
    expect(parsed.token).toBe(original.token)
  })
})
