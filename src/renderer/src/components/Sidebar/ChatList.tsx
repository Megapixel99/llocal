import { Card } from '@renderer/ui/Card'
import { ComponentProps, useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { getDbReturn, useDb } from '@renderer/hooks/useDb'
import { useAtom, useAtomValue } from 'jotai'
import { selectedChatIndexAtom, streamingAtom, titleUpdateAtom } from '@renderer/store/mocks'
import { ChatMenu } from './ChatMenu/ChatMenu'
import { t } from '@renderer/utils/utils'

export const ChatList = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const { getMessageList, markRead } = useDb()
  const [selectedChatIndex, setSelectedChatIndex] = useAtom(selectedChatIndexAtom)
  const [chatList, setChatList] = useState<getDbReturn[]>([])
  const [stream] = useAtom(streamingAtom)
  const titleUpdate = useAtomValue(titleUpdateAtom)

  useEffect(() => {
    async function getList(): Promise<void> {
      const response = await getMessageList()
      setChatList(response)
    }
    getList()
  }, [selectedChatIndex, titleUpdate])

  async function handleClick(date: string): Promise<void> {
    // const response = await updateDate(date);
    // This is because if there's text streaming the user should not be able to switch chats
    if (!stream) {
      await markRead(date) // opening a chat clears its unread badge
      setSelectedChatIndex(date)
    }
  }


  return (
    <div className={twMerge('flex flex-col gap-2 overflow-auto', className)} {...props}>
      {chatList.map((val) => {
        return <Card key={val.date} onClick={() => handleClick(val.date)} className={`group relative cursor-pointer ${selectedChatIndex === val.date ? "opacity-100" : "opacity-50"} ${stream && "cursor-default"} hover:opacity-100 transition-opacity`}>
          <ChatMenu date={val.date} className="absolute z-10 right-5 top-1/2 transform -translate-y-1/2 my-auto" />
          {/* fall back to the first message when there's no title ("" is not caught by ??), and guard empty chats */}
          <h1 className={"group-hover:fade line-clamp-1 flex items-center gap-2"}>
            {/* unread badge: shown for any chat with a new reply that isn't the one currently open */}
            {val.unread && val.date !== selectedChatIndex && (
              <span className="size-2 shrink-0 rounded-full bg-blue-500" title={t('Unread')} />
            )}
            {val.title || val.chat?.[0]?.content || t('Untitled chat')}
          </h1>
        </Card>
      })}
    </div>
  )
}
