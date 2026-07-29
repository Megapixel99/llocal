/// <reference types="vite/client" />
/**
 * Cross-platform text extraction for in-chat document analysis.
 *
 * Runs entirely in the renderer (Electron + Capacitor WebView), so it works on
 * desktop and phone without a server round-trip: text-like files are read
 * directly, PDFs are parsed with pdf.js (the browser-capable extractor — the repo's
 * pdf-parse is Node-only). Output is capped so a huge document can't blow the model
 * context or the UI. This is distinct from the RAG knowledge base (retrieval): the
 * extracted text is dropped straight into the next turn's context.
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Character cap for a single attached document. */
export const MAX_DOC_CHARS = 100_000

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml',
  'html', 'htm', 'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql',
  'toml', 'ini', 'cfg', 'conf', 'env', 'css', 'scss'
])

function ext(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase()
}

/** Whether we can extract text from this file (by extension or a text/* MIME). */
export function isSupportedDoc(name: string, type = ''): boolean {
  const e = ext(name)
  return e === 'pdf' || TEXT_EXTS.has(e) || type.startsWith('text/')
}

async function readPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => (it && typeof it === 'object' && 'str' in it ? (it as { str: string }).str : ''))
      .join(' ')
    pages.push(line)
  }
  return pages.join('\n\n')
}

/** Extract plain text from a supported file; throws for unsupported types. */
export async function extractTextFromFile(file: File): Promise<string> {
  if (!isSupportedDoc(file.name, file.type)) {
    throw new Error(`Unsupported file type: ${file.name}`)
  }
  let text = ext(file.name) === 'pdf' ? await readPdf(file) : await file.text()
  text = text.trim()
  if (text.length > MAX_DOC_CHARS) text = `${text.slice(0, MAX_DOC_CHARS)}\n\n[…truncated]`
  return text
}
