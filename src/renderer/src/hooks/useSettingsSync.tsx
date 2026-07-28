import { useEffect } from 'react'
import { isServerConfigured } from '@renderer/platform/config'
import { syncSettings } from '@renderer/platform/settingsSync'

/** How often to reconcile settings with the companion server (ms). */
const POLL_MS = 20000

/**
 * Mount once (App root). Keeps non-secret preferences in agreement with the
 * companion server: reconciles on mount, on window focus, and on a light interval.
 * No-op when no server is configured, so the stock local-only app is unaffected.
 */
export function useSettingsSync(): void {
  useEffect(() => {
    if (!isServerConfigured()) return
    let active = true
    const tick = (): void => {
      if (active) void syncSettings()
    }
    tick() // initial reconcile on mount
    const onFocus = (): void => tick()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [])
}
