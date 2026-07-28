/**
 * Pure helpers for the Artifacts side panel — no React/DOM deps so they're cheap to unit-test.
 */
import { isPreviewableLanguage } from './preview'

const EXT: Record<string, string> = {
  html: 'html',
  css: 'css',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  svg: 'svg',
  mermaid: 'mmd',
  json: 'json',
  python: 'py',
  markdown: 'md'
}

/** Can this language render a live preview / diagram (vs. just show code)? */
export const canPreview = (language: string): boolean =>
  language === 'mermaid' || isPreviewableLanguage(language)

/** Build a safe download filename for an artifact: slugified title + a language-appropriate ext. */
export function artifactFilename(title: string, language: string): string {
  const ext = EXT[(language ?? '').toLowerCase()] ?? 'txt'
  const safe =
    (title || 'artifact')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'artifact'
  return `${safe}.${ext}`
}
