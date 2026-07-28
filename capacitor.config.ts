import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor wraps the web build (dist-web) in a native iOS shell.
 * Run `npm run build:web && npm run cap:sync` after changing renderer code,
 * then `npm run cap:ios` to open Xcode. See MOBILE.md.
 */
const config: CapacitorConfig = {
  appId: 'in.llocal.app',
  appName: 'LLocal',
  webDir: 'dist-web',
  ios: {
    // Draw edge-to-edge (the web layer fills the whole screen incl. the safe areas) instead of
    // letting WKWebView inset the content — 'always' left black bars top/bottom and, combined with
    // 100vh, pushed the composer under the home indicator. CSS env(safe-area-inset-*) handles the
    // notch/home-indicator spacing instead (see index.css / the composer + hamburger).
    contentInset: 'never'
  }
}

export default config
