import { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { getCurrentToken } from './token-store.ts'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Bearer-token auth. Every route except /health requires the shared token. */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!token || !safeEqual(token, getCurrentToken())) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
