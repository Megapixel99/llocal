import { Card } from '@renderer/ui/Card'
import Logo from '../../assets/logo.png'
import { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'
import { useSetAtom } from 'jotai'
import { chatAtom, contextUsageAtom, selectedChatIndexAtom, sessionMetricsAtom, stopGeneratingAtom, streamingAtom, suggestionsAtom } from '@renderer/store/mocks'
import { getOllama } from '@renderer/utils/ollama'
import { t } from '@renderer/utils/utils'

export const NewChat = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const setChat = useSetAtom(chatAtom)
  const setSelectedChatIndex = useSetAtom(selectedChatIndexAtom)
  const setStream = useSetAtom(streamingAtom)
  const setStopGenerating = useSetAtom(stopGeneratingAtom)
  const setSuggestions = useSetAtom(suggestionsAtom)
  const setContextUsage = useSetAtom(contextUsageAtom)
  const setSessionMetrics = useSetAtom(sessionMetricsAtom)
  // Always start fresh: abort any in-flight generation and clear the streaming buffer. Gating this on
  // an empty buffer used to leave the button dead if a run errored out without clearing its state.
  function handleClick(): void {
    getOllama().abort()
    setStream('')
    setStopGenerating(false)
    setSelectedChatIndex('')
    setChat([])
    setSuggestions(pre => ({ ...pre, prompts: [] }))
    setContextUsage(pre => ({ ...pre, used: 0 })) // reset the context meter for the fresh chat
    setSessionMetrics([]) // clear analytics for the fresh chat
  }

  return (
    <div onClick={handleClick} className={twMerge('', className)} {...props}>
      <Card className="flex items-center gap-3 p-3 bg-opacity-10 dark:bg-opacity-10 hover:bg-opacity-50 transition-opacity cursor-pointer">
        <img src={Logo} alt="" className="size-12 dark:invert" />
        <h1>{t("Start a chat")}</h1>
      </Card>
    </div>
  )
}
