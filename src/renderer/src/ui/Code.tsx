import React, { useState } from 'react'
import SyntaxHighlighter, { SyntaxHighlighterProps } from 'react-syntax-highlighter'
import { Separator } from './Separator'
import { LuEye, LuCode } from 'react-icons/lu'
import Artifacts from './Artifacts'
import { CopyButton } from './CopyButton'
import { Card } from './Card'
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/cjs/styles/hljs'
import { isPreviewableLanguage } from '@renderer/utils/preview'

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
  return (
    // match[1]
    <Card className="my-2 max-h-full max-w-full p-2" {...props}>
      <div className="flex items-center justify-between rounded-t-md p-1">
        <p className="text-xs opacity-50">{language}</p>
        <div className="flex items-center justify-center gap-3">
          <CopyButton text={children} />
          {showToggle && (
            <button
              type="button"
              onClick={() => setArtifact((pre) => !pre)}
              className="flex cursor-pointer items-center gap-1 text-xs opacity-75 transition-opacity hover:opacity-100"
            >
              {isArtifact ? <LuCode /> : <LuEye />}
              {isArtifact ? 'Code' : 'Preview'}
            </button>
          )}
        </div>
      </div>
      <Separator className="h-[1px]" />
      {isArtifact ? (
        <Artifacts code={String(children)} language={language ?? ''} />
      ) : (
        <SyntaxHighlighter
          customStyle={{ background: 0 }}
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
