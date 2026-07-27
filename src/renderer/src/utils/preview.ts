/**
 * Helpers that turn a fenced code block into a self-contained HTML document for
 * the live preview.
 *
 * The renderer runs under a strict Content-Security-Policy (`script-src 'self'`
 * with no `'unsafe-inline'`). Local-scheme documents — `srcdoc`, `data:` and
 * `blob:` iframes — inherit that policy from the embedding page, so inline
 * scripts inside them are refused. A *real* same-origin navigation does not
 * inherit it: it uses its own policy instead. That is why the preview is hosted
 * by the bundled `public/preview.html` shell (loaded from `'self'`) which
 * declares its own permissive policy and renders the code we hand it over
 * `postMessage`. These helpers build that code payload.
 */

export type PreviewLanguage = 'html' | 'css' | 'javascript' | 'svg'

/**
 * Map a fenced code block's language hint onto one of the four preview modes,
 * or `null` when the language cannot be previewed as a web page.
 */
export function normalizePreviewLanguage(language: string | undefined): PreviewLanguage | null {
  const lang = (language ?? '').trim().toLowerCase()
  if (['html', 'htm', 'xhtml'].includes(lang)) return 'html'
  if (lang === 'svg') return 'svg'
  if (lang === 'css') return 'css'
  if (['javascript', 'js', 'mjs', 'cjs'].includes(lang)) return 'javascript'
  return null
}

/** Whether a code block of this language can be rendered in the live preview. */
export function isPreviewableLanguage(language: string | undefined): boolean {
  return normalizePreviewLanguage(language) !== null
}

// Relay `console.*`, uncaught errors and rejected promises out to the preview
// shell (this frame's parent), which forwards them to the app so they can be
// shown in the console panel. Kept dependency-free so it runs inside the
// isolated, opaque-origin preview frame.
const CONSOLE_RELAY = /* html */ `<script>
(function () {
  function serialize(value) {
    if (value instanceof Error) return value.stack || (value.name + ': ' + value.message)
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) } catch (e) { return String(value) }
  }
  function send(level, args) {
    try {
      var text = Array.prototype.map.call(args, serialize).join(' ')
      parent.postMessage({ type: 'llocal-preview-console', level: level, text: text }, '*')
    } catch (e) { /* ignore */ }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level]
    console[level] = function () {
      send(level, arguments)
      if (typeof original === 'function') original.apply(console, arguments)
    }
  })
  window.addEventListener('error', function (event) {
    send('error', [event.error ? event.error : (event.message + ' (' + event.filename + ':' + event.lineno + ')')])
  })
  window.addEventListener('unhandledrejection', function (event) {
    send('error', ['Unhandled promise rejection: ' + serialize(event.reason)])
  })
})()
</script>`

// Minimal, theme-neutral base styling so bare fragments look reasonable without
// imposing on documents that bring their own styles.
const BASE_STYLE = /* css */ `<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; }
  body { padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; }
</style>`

const looksLikeFullDocument = (code: string): boolean =>
  /<!doctype\s+html/i.test(code) || /<html[\s>]/i.test(code)

// Insert the relay as early as possible so it captures errors from the rest of
// the document. Prefer just after <head>, then after <html>, else prepend.
function injectRelay(html: string): string {
  const headMatch = html.match(/<head[^>]*>/i)
  if (headMatch) {
    const at = headMatch.index! + headMatch[0].length
    return html.slice(0, at) + CONSOLE_RELAY + html.slice(at)
  }
  const htmlMatch = html.match(/<html[^>]*>/i)
  if (htmlMatch) {
    const at = htmlMatch.index! + htmlMatch[0].length
    return html.slice(0, at) + CONSOLE_RELAY + html.slice(at)
  }
  return CONSOLE_RELAY + html
}

function wrapHtmlFragment(code: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${BASE_STYLE}
</head>
<body>
${code}
</body>
</html>`
}

function wrapSvg(code: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
${BASE_STYLE}
<style>
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
${code}
</body>
</html>`
}

// A CSS block has nothing to render on its own, so it is applied to a small,
// representative sample of markup — the same spirit as a component style guide.
function wrapCss(code: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${BASE_STYLE}
<style>
${code}
</style>
</head>
<body>
<h1>Heading level 1</h1>
<h2>Heading level 2</h2>
<p>A paragraph of body text with a <a href="#">link</a>, some <strong>bold</strong> and <em>italic</em> words, and inline <code>code</code>.</p>
<button type="button">Button</button>
<input type="text" placeholder="Text input" />
<ul><li>List item one</li><li>List item two</li></ul>
<blockquote>A block quote.</blockquote>
<div class="card">A div with class <code>card</code>.</div>
</body>
</html>`
}

function wrapJavaScript(code: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${BASE_STYLE}
</head>
<body>
<div id="app"></div>
<script>
try {
${code}
} catch (error) {
  console.error(error)
}
</script>
</body>
</html>`
}

/**
 * Build the full HTML document that the preview frame should render for a given
 * code block. Returns `null` for languages that cannot be previewed.
 */
export function buildPreviewDocument(language: string | undefined, code: string): string | null {
  const mode = normalizePreviewLanguage(language)
  if (!mode) return null

  let document: string
  switch (mode) {
    case 'html':
      document = looksLikeFullDocument(code) ? code : wrapHtmlFragment(code)
      break
    case 'svg':
      document = wrapSvg(code)
      break
    case 'css':
      document = wrapCss(code)
      break
    case 'javascript':
      document = wrapJavaScript(code)
      break
  }
  return injectRelay(document)
}
