/**
 * Text-to-speech route. Same kokoro-js model the desktop app uses, but run
 * in-process on the host (no child_process.fork indirection) and returned as a
 * WAV body. The model is heavy, so it is loaded lazily and cached.
 */
import { Router } from 'express'
import fs from 'fs'
import { config } from './config.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsInstance: any = null

async function getTts(): Promise<unknown> {
  if (ttsInstance) return ttsInstance
  fs.mkdirSync(config.ttsCacheDir, { recursive: true })
  const kokoro = await import('kokoro-js')
  kokoro.env.cacheDir = config.ttsCacheDir
  ttsInstance = await kokoro.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q4',
    device: 'cpu'
  })
  return ttsInstance
}

export const ttsRouter = Router()

ttsRouter.post('/', async (req, res) => {
  try {
    const { text } = req.body as { text: string }
    if (!text) return res.status(400).json({ error: 'Missing text' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tts = (await getTts()) as any
    const audio = await tts.generate(text, { voice: 'af_sky' })
    const wav = audio.toWav()
    const buffer = Buffer.from(new Uint8Array(wav))
    res.setHeader('Content-Type', 'audio/wav')
    res.send(buffer)
  } catch (err) {
    res.status(501).json({
      error: `TTS unavailable: ${String(err)}. Ensure kokoro-js is installed on the host.`
    })
  }
})
