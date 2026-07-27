/**
 * Optional transparent proxy to the local Ollama server.
 *
 * Lets the mobile app reach Ollama through the single companion-server origin
 * (with the bearer token) instead of hitting Ollama directly — which avoids
 * CORS/ATS headaches on the device. Streaming responses (chat) are piped
 * through unbuffered. Mounted before the JSON body parser so the raw request
 * body is forwarded intact.
 */
import { Router } from 'express'
import { Readable } from 'stream'
import { config } from './config.ts'

export const ollamaProxyRouter = Router()

ollamaProxyRouter.all('/*', async (req, res) => {
  try {
    const target = config.ollamaUrl.replace(/\/$/, '') + req.originalUrl.replace(/^\/ollama/, '')
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (['host', 'content-length', 'authorization', 'connection'].includes(k.toLowerCase())) continue
      if (typeof v === 'string') headers[k] = v
    }

    const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers }
    if (!['GET', 'HEAD'].includes(req.method)) {
      init.body = req as unknown as ReadableStream
      init.duplex = 'half'
    }

    const upstream = await fetch(target, init as RequestInit)
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-encoding') return
      res.setHeader(key, value)
    })
    if (upstream.body) {
      Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
    } else {
      res.end()
    }
  } catch (err) {
    res.status(502).json({ error: `Ollama proxy failed: ${String(err)}` })
  }
})
