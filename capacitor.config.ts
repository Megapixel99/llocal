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
    contentInset: 'always'
  }
}

export default config
