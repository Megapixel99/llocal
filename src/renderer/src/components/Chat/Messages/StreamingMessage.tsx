import { chatAtom, experimentalSearchAtom, generatingAtom, imageAttatchmentAtom, streamingAtom } from "@renderer/store/mocks"
import { Card } from "@renderer/ui/Card"
import { AiMessage } from "@renderer/ui/Message"
import { Thinking } from "@renderer/ui/Thinking"
import { cn } from "@renderer/utils/utils"
import { useAtom, useAtomValue } from "jotai"
import { ComponentProps } from "react"
import Skeleton from "react-loading-skeleton"
import Suggestions from "../suggestions"
import { useTheme } from "@renderer/ui/ThemeProvider"

export const StreamingMessage = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {

  const chat = useAtomValue(chatAtom)
  const [stream] = useAtom(streamingAtom)
  const generating = useAtomValue(generatingAtom)
  const { theme } = useTheme()
  const imageAttachment = useAtomValue(imageAttatchmentAtom)
  const experimentalSearch = useAtomValue(experimentalSearchAtom)
  // pre-processing (web-search / image / RAG) has its own skeleton; otherwise we show a thinking indicator
  const preProcessing = experimentalSearch || imageAttachment
  return <div className={cn("", className)} {...props}>
    {stream && (
      <div className="flex flex-col gap-2">
        <AiMessage message={stream} stream={!!stream} />
      </div>
    )}
    {chat.length > 0 &&
      chat[chat.length - 1].role == 'user' &&
      !stream &&
      preProcessing && (
        <Card className="w-4/5">
          <Skeleton
            className="opacity-50"
            baseColor={theme == 'dark' ? '#FFFFFF' : '#202020'}
            highlightColor={theme == 'dark' ? '#bfbfbf' : ' #b3b3b3'}
            borderRadius={5}
            count={4}
          />
        </Card>
      )}
    {/* waiting on the first token of a normal generation: animated thinking indicator */}
    {generating && !stream && !preProcessing && <Thinking />}
    {!generating && !stream && <Suggestions />}

  </div>
}
