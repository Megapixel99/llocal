/**
 * Renderer-side i18n for the mobile / web build.
 *
 * On Electron, translations live in the main process and `window.api.translate`
 * is a synchronous IPC call. A WebView has no main process, so we run i18next
 * directly in the renderer with the bundled locale JSON. Initialization is
 * synchronous (resources are provided inline, no async backend) which keeps the
 * existing synchronous `t()` helper in utils/utils.ts working unchanged.
 */
import i18n from 'i18next'
// Bundled at build time so the app ships with translations (no filesystem).
import enTranslation from '../../../../resources/locales/en/translation.json'

let initialized = false

export function initWebI18n(language = 'en'): void {
  if (initialized) return
  i18n.init({
    lng: language,
    fallbackLng: 'en',
    debug: false,
    resources: {
      en: { translation: enTranslation }
    },
    interpolation: { escapeValue: false }
  })
  initialized = true
}

export function webTranslate(key: string, options: object = {}): string {
  if (!initialized) initWebI18n()
  return i18n.t(key, options as Record<string, unknown>) as string
}

export function webGetLanguages(): string[] {
  return (i18n.languages as string[]) ?? ['en']
}

export async function webChangeLanguage(language: string): Promise<boolean> {
  try {
    await i18n.changeLanguage(language)
    return true
  } catch {
    return false
  }
}
