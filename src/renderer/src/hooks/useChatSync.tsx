import { useEffect } from 'react'
import { useDb } from './useDb'
import { isServerConfigured } from '@renderer/platform/config'

/** How often to poll the companion server for chat changes (ms). */
const POLL_MS = 15000

/**
 * Mount once (App root). Keeps the local chat cache in agreement with the
 * companion server for server-authoritative sync: pulls on mount, on window
 * focus, and on a light interval. No-op when no server is configured, so the
 * stock local-only desktop app is unaffected.
 */
export function useChatSync(): void {
  const { syncNow } = useDb()

  useEffect(() => {
    if (!isServerConfigured()) return
    let active = true
    const tick = (): void => {
      if (active) void syncNow()
    }
    tick() // initial pull on mount
    const onFocus = (): void => tick()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
    // syncNow reads live config/cursor/store on each call, so a stable mount is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
