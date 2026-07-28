import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/cjs/styles/hljs'
import { LuCode, LuEye, LuX, LuDownload } from 'react-icons/lu'
import { activeArtifactAtom } from '@renderer/store/mocks'
import { cn, t } from '@renderer/utils/utils'
import { CopyButton } from '@renderer/ui/CopyButton'
import Artifacts from '@renderer/ui/Artifacts'
import { artifactFilename, canPreview } from '@renderer/utils/artifact'

function download(title: string, language: string, code: string): void {
  const blob = new Blob([code], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = artifactFilename(title, language)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Claude-style Artifacts side panel: the artifact opens beside the chat (a full-screen overlay on
 * mobile), with a Preview/Code toggle, copy, download and close. Resizable by dragging its left edge
 * on desktop. Driven by activeArtifactAtom — a message's "Open in panel" affordance sets it.
 */
export const ArtifactPanel = (): React.ReactElement | null => {
  const [artifact, setArtifact] = useAtom(activeArtifactAtom)
  const [showCode, setShowCode] = useState(false)
  const [width, setWidth] = useState(480)
  const [isLg, setIsLg] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  )
  const dragging = useRef(false)

  useEffect(() => {
    const onResize = (): void => setIsLg(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Default to the preview when one is available; otherwise show the code.
  useEffect(() => {
    if (artifact) setShowCode(!canPreview(artifact.language))
  }, [artifact])

  // Drag-to-resize (desktop). The panel is anchored right, so a smaller x = wider panel.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const next = window.innerWidth - e.clientX
      setWidth(Math.min(Math.max(next, 320), Math.min(900, window.innerWidth - 360)))
    }
    const onUp = (): void => {
      dragging.current = false
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (!artifact) return null
  const preview = canPreview(artifact.language)

  return (
    <div
      // Mobile: full-screen overlay. Desktop (lg): a resizable column pinned to the right.
      className="fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-lg lg:static lg:z-auto lg:h-full lg:shrink-0 lg:border-l lg:border-foreground/10 lg:bg-background/40"
      style={isLg ? { width } : undefined}
    >
      {/* Resize handle (desktop only) */}
      <div
        onMouseDown={() => {
          dragging.current = true
          document.body.style.userSelect = 'none'
        }}
        className="absolute left-0 top-0 hidden h-full w-1 cursor-col-resize hover:bg-foreground/20 lg:block"
        title={t('Drag to resize')}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-foreground/10 p-3">
        <span className="flex-1 truncate text-sm font-medium">{artifact.title}</span>
        {preview && (
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs opacity-70 transition hover:bg-foreground/10 hover:opacity-100"
            title={showCode ? t('Show preview') : t('Show code')}
          >
            {showCode ? <LuEye /> : <LuCode />}
            {showCode ? t('Preview') : t('Code')}
          </button>
        )}
        <CopyButton className="opacity-70 hover:opacity-100" text={artifact.code} />
        <button
          type="button"
          onClick={() => download(artifact.title, artifact.language, artifact.code)}
          className="opacity-70 transition hover:opacity-100"
          title={t('Download')}
        >
          <LuDownload />
        </button>
        <button
          type="button"
          onClick={() => setArtifact(null)}
          className="opacity-70 transition hover:opacity-100"
          title={t('Close')}
        >
          <LuX className="text-lg" />
        </button>
      </div>

      {/* Body */}
      <div className={cn('flex-1 overflow-auto', preview && !showCode ? 'p-0' : 'p-3')}>
        {preview && !showCode ? (
          <Artifacts language={artifact.language} code={artifact.code} className="h-full" />
        ) : (
          <SyntaxHighlighter
            language={artifact.language}
            style={atomOneDarkReasonable}
            customStyle={{ background: 'transparent', margin: 0, fontSize: 13 }}
            wrapLongLines
          >
            {artifact.code}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  )
}
