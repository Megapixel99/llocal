import React, { useState } from 'react'
import { useSetAtom } from 'jotai'
import SyntaxHighlighter, { SyntaxHighlighterProps } from 'react-syntax-highlighter'
import { Separator } from './Separator'
import { LuEye, LuCode, LuPanelRight } from 'react-icons/lu'
import Artifacts from './Artifacts'
import { CopyButton } from './CopyButton'
import { Card } from './Card'
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/cjs/styles/hljs'
import { isPreviewableLanguage } from '@renderer/utils/preview'
import { activeArtifactAtom } from '@renderer/store/mocks'
import { t } from '@renderer/utils/utils'
import { getExecPolicy } from '@renderer/platform/config'
import { isShellLanguage } from '../../../shared/exec-policy'
import { RunCommandButton } from '@renderer/components/Chat/RunCommandButton'

// Languages that render as their own diagram/preview rather than plain code.
const otherArtifacts = ['mermaid']

const canRenderArtifact = (language: string): boolean =>
  otherArtifacts.includes(language) || isPreviewableLanguage(language)

export const Code = ({
  children,
  language,
  ...props
}: SyntaxHighlighterProps): React.ReactElement => {
  const [isArtifact, setArtifact] = useState(false)
  const showToggle = canRenderArtifact(language ?? '')
  const setActiveArtifact = useSetAtom(activeArtifactAtom)
  const code = String(children)
  return (
    // match[1]
    <Card className="my-2 max-h-full max-w-full p-2" {...props}>
      <div className="flex items-center justify-between rounded-t-md p-1">
        <p className="text-xs opacity-50">{language}</p>
        <div className="flex items-center justify-center gap-3">
          {/* Run an LLM-generated shell command — only when execution is enabled. */}
          {getExecPolicy().enabled && isShellLanguage(language) && <RunCommandButton command={code} />}
          <CopyButton text={children} />
          {showToggle && (
            <>
              <button
                type="button"
                onClick={() => setArtifact((pre) => !pre)}
                className="flex cursor-pointer items-center gap-1 text-xs opacity-75 transition-opacity hover:opacity-100"
              >
                {isArtifact ? <LuCode /> : <LuEye />}
                {isArtifact ? 'Code' : 'Preview'}
              </button>
              {/* Open this artifact in the Claude-style side panel. */}
              <button
                type="button"
                onClick={() =>
                  setActiveArtifact({ code, language: language ?? '', title: language ? `${language} artifact` : 'Artifact' })
                }
                className="flex cursor-pointer items-center gap-1 text-xs opacity-75 transition-opacity hover:opacity-100"
                title={t('Open in side panel')}
              >
                <LuPanelRight /> {t('Open')}
              </button>
            </>
          )}
        </div>
      </div>
      <Separator className="h-[1px]" />
      {isArtifact ? (
        <Artifacts code={String(children)} language={language ?? ''} />
      ) : (
        <SyntaxHighlighter
          // Scroll long lines inside the block instead of letting them stretch the message bubble
          // past the chat column (which left a lopsided gap on the right + clipped content).
          customStyle={{ background: 0, overflowX: 'auto', maxWidth: '100%' }}
          PreTag="div"
          language={language}
          style={atomOneDarkReasonable}
        >
          {children}
        </SyntaxHighlighter>
      )}
    </Card>
  )
}
