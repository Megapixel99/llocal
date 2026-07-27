import { resolve } from 'path'
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Standalone web build of the renderer, used as the Capacitor `webDir` for the
 * mobile app. It reuses the exact same renderer source as the Electron build —
 * only the shell differs. Output goes to `dist-web/`.
 */

// The desktop index.html pins connect-src to localhost:11434. On mobile the
// user configures a remote Ollama IP and a companion server, so we relax the
// CSP for this build only (self-hosted personal tool → any host allowed).
function relaxCsp(): Plugin {
  return {
    name: 'llocal-relax-csp',
    transformIndexHtml(html) {
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src * ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data: http: https:; media-src blob: data:; frame-src 'self'" />`
      )
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react(), relaxCsp()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  server: {
    // Allow importing bundled assets (locale JSON) from outside the renderer root.
    fs: { allow: [resolve(__dirname)] }
  }
})
