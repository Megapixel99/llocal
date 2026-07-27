import './assets/index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isElectron } from './platform/detect'
import { createHttpApi } from './platform/httpApi'
import { initWebI18n } from './platform/i18n-web'

// On non-Electron builds (Capacitor / web) there is no preload IPC bridge, so we
// install an HTTP-backed implementation of `window.api` and initialize renderer
// i18n before mounting. Every existing `window.api.*` call site then works
// unchanged. Electron keeps its native preload bridge.
if (!isElectron()) {
  initWebI18n()
  ;(window as unknown as { api: unknown }).api = createHttpApi()
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
