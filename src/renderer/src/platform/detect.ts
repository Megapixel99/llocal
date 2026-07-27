/**
 * Runtime platform detection.
 *
 * Electron injects `window.api` via the preload bridge before the renderer
 * loads. A Capacitor/web build has no preload, so `window.api` is absent until
 * we install the HTTP adapter ourselves. Capture the state at import time so a
 * later assignment of `window.api` (the mobile adapter) doesn't flip the result.
 */

interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
}

const hadPreloadApi =
  typeof window !== 'undefined' && typeof (window as unknown as { api?: unknown }).api !== 'undefined'

export function isElectron(): boolean {
  const hasCapacitor = typeof window !== 'undefined' && !!(window as unknown as CapacitorGlobal).Capacitor
  return hadPreloadApi && !hasCapacitor
}

export function isCapacitorNative(): boolean {
  const cap = (typeof window !== 'undefined' && (window as unknown as CapacitorGlobal).Capacitor) || undefined
  return !!cap?.isNativePlatform?.()
}

/** Coarse platform label used where the app only needs to distinguish desktop vs mobile/web. */
export function platformLabel(): string {
  if (isElectron()) return 'electron'
  const cap = (typeof window !== 'undefined' && (window as unknown as CapacitorGlobal).Capacitor) || undefined
  return cap?.getPlatform?.() ?? 'web'
}
