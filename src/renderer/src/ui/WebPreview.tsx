import {
  ComponentProps,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { LuRefreshCw, LuMaximize2, LuMinimize2, LuTerminal, LuX } from 'react-icons/lu'
import { cn, Portal } from '@renderer/utils/utils'
import { buildPreviewDocument } from '@renderer/utils/preview'
import { useClickOutside } from '@renderer/hooks/useClickOutside'
import ToolTip from './ToolTip'

export interface ConsoleLine {
  level: string
  text: string
}

// Where the preview shell lives. Resolved relative to the current document so
// it works in electron-vite dev (http origin), the packaged file:// build and
// the standalone web build alike — `preview.html` sits at the renderer root in
// every case.
const PREVIEW_SHELL_URL = (): string => new URL('preview.html', window.location.href).href

const MAX_CONSOLE_LINES = 200

/**
 * Hosts the sandboxed preview shell and pushes the built document into it once
 * the shell reports ready. Collects console/error output relayed back from the
 * previewed code. Re-mount (via `key`) to force a full reload.
 */
function PreviewFrame({
  doc,
  onConsole,
  className,
  ...props
}: {
  doc: string
  onConsole: (line: ConsoleLine) => void
} & ComponentProps<'iframe'>): ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const shellUrl = useMemo(PREVIEW_SHELL_URL, [])

  const post = useCallback((html: string): void => {
    frameRef.current?.contentWindow?.postMessage({ type: 'llocal-preview-render', html }, '*')
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      // Only trust messages coming from this component's own shell frame.
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'llocal-preview-ready') {
        readyRef.current = true
        post(doc)
      } else if (data.type === 'llocal-preview-console') {
        onConsole({ level: String(data.level ?? 'log'), text: String(data.text ?? '') })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [doc, post, onConsole])

  // Push updates whenever the document changes after the shell is ready. The
  // ready handshake covers the very first render.
  useEffect(() => {
    if (readyRef.current) post(doc)
  }, [doc, post])

  return (
    <iframe
      ref={frameRef}
      src={shellUrl}
      title="Live preview"
      // The shell announces itself with a ready message; posting again on load
      // covers the case where that message races ahead of our listener.
      onLoad={() => {
        readyRef.current = true
        post(doc)
      }}
      // No allow-same-origin: the previewed code runs in an opaque origin and
      // cannot reach the app. The shell talks to us over postMessage only.
      sandbox="allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
      className={cn('h-full w-full border-0 bg-white', className)}
      {...props}
    />
  )
}

function ConsolePanel({
  lines,
  onClear,
  className
}: {
  lines: ConsoleLine[]
  onClear: () => void
} & ComponentProps<'div'>): ReactElement {
  const levelColor = (level: string): string => {
    if (level === 'error') return 'text-red-400'
    if (level === 'warn') return 'text-yellow-400'
    if (level === 'debug') return 'text-blue-300'
    return 'text-foreground/80'
  }
  return (
    <div className={cn('flex flex-col rounded-b-md bg-black/90 font-mono text-xs', className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-2 py-1">
        <span className="text-white opacity-60">Console</span>
        <button
          type="button"
          onClick={onClear}
          className="text-white opacity-60 transition-opacity hover:opacity-100"
        >
          Clear
        </button>
      </div>
      <div className="max-h-40 space-y-0.5 overflow-auto p-2">
        {lines.map((line, index) => (
          <pre
            key={index}
            className={cn('m-0 whitespace-pre-wrap break-words', levelColor(line.level))}
          >
            {line.text}
          </pre>
        ))}
      </div>
    </div>
  )
}

interface WebPreviewProps extends ComponentProps<'div'> {
  language: string
  code: string
}

/**
 * Live preview for web based code blocks (HTML, CSS, SVG, JavaScript), rendered
 * safely in a sandboxed iframe. Offers refresh, an expand-to-fullscreen view
 * and a console panel for `console.*` output and runtime errors.
 */
export default function WebPreview({
  language,
  code,
  className,
  ...props
}: WebPreviewProps): ReactElement {
  const doc = useMemo(() => buildPreviewDocument(language, code) ?? '', [language, code])
  const [reloadKey, setReloadKey] = useState(0)
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [showConsole, setShowConsole] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const overlayRef = useClickOutside<HTMLDivElement>(() => setExpanded(false))

  // A fresh reload starts with a clean console.
  const handleConsole = useCallback((line: ConsoleLine): void => {
    setConsoleLines((previous) => [...previous, line].slice(-MAX_CONSOLE_LINES))
  }, [])

  const reload = useCallback((): void => {
    setConsoleLines([])
    setReloadKey((previous) => previous + 1)
  }, [])

  // Close the fullscreen view on Escape.
  useEffect(() => {
    if (!expanded) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const errorCount = consoleLines.filter((line) => line.level === 'error').length

  const controls = (
    <div className="flex items-center gap-2">
      <ToolTip tooltip="Console" variant="bottom">
        <button
          type="button"
          onClick={() => setShowConsole((previous) => !previous)}
          className={cn(
            'relative flex items-center opacity-60 transition-opacity hover:opacity-100',
            showConsole && 'opacity-100'
          )}
        >
          <LuTerminal />
          {errorCount > 0 && (
            <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
        </button>
      </ToolTip>
      <ToolTip tooltip="Reload" variant="bottom">
        <button
          type="button"
          onClick={reload}
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <LuRefreshCw />
        </button>
      </ToolTip>
      <ToolTip tooltip={expanded ? 'Exit fullscreen' : 'Fullscreen'} variant="bottom">
        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          {expanded ? <LuMinimize2 /> : <LuMaximize2 />}
        </button>
      </ToolTip>
    </div>
  )

  const previewBody = (
    <>
      <div className="flex items-center justify-between px-1 py-1">
        <p className="text-xs opacity-50">Preview</p>
        {controls}
      </div>
      <div
        className={cn('w-full overflow-hidden rounded-md bg-white', expanded ? 'flex-1' : 'h-96')}
      >
        <PreviewFrame key={reloadKey} doc={doc} onConsole={handleConsole} />
      </div>
      {showConsole && (
        <ConsolePanel lines={consoleLines} onClear={() => setConsoleLines([])} className="mt-1" />
      )}
    </>
  )

  if (expanded) {
    return (
      <>
        {Portal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
            <div
              ref={overlayRef}
              className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border-2 border-foreground/5 bg-background p-2 shadow-xl"
            >
              <div className="flex items-center justify-between px-1 py-1">
                <p className="text-xs opacity-50">Preview</p>
                <div className="flex items-center gap-2">
                  {controls}
                  <ToolTip tooltip="Close" variant="bottom">
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="opacity-60 transition-opacity hover:opacity-100"
                    >
                      <LuX />
                    </button>
                  </ToolTip>
                </div>
              </div>
              <div className="w-full flex-1 overflow-hidden rounded-md bg-white">
                <PreviewFrame key={reloadKey} doc={doc} onConsole={handleConsole} />
              </div>
              {showConsole && (
                <ConsolePanel
                  lines={consoleLines}
                  onClear={() => setConsoleLines([])}
                  className="mt-1"
                />
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={cn('flex flex-col', className)} {...props}>
      {previewBody}
    </div>
  )
}
