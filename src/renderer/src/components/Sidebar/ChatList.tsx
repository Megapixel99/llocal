import { Card } from '@renderer/ui/Card'
import { ComponentProps, useEffect, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { getDbReturn, useDb } from '@renderer/hooks/useDb'
import { useAtom, useAtomValue } from 'jotai'
import { selectedChatIndexAtom, streamingAtom, titleUpdateAtom } from '@renderer/store/mocks'
import { ChatMenu } from './ChatMenu/ChatMenu'
import { t } from '@renderer/utils/utils'
import { LuSearch } from 'react-icons/lu'
import {
  recencyBucket,
  chatMatchesQuery,
  RECENCY_ORDER,
  type RecencyBucket
} from '../../../../shared/chat-grouping'

export const ChatList = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const { getMessageList, markRead } = useDb()
  const [selectedChatIndex, setSelectedChatIndex] = useAtom(selectedChatIndexAtom)
  const [chatList, setChatList] = useState<getDbReturn[]>([])
  const [stream] = useAtom(streamingAtom)
  const [query, setQuery] = useState('')
  const titleUpdate = useAtomValue(titleUpdateAtom)

  useEffect(() => {
    async function getList(): Promise<void> {
      const response = await getMessageList()
      setChatList(response)
    }
    getList()
  }, [selectedChatIndex, titleUpdate])

  async function handleClick(date: string): Promise<void> {
    // This is because if there's text streaming the user should not be able to switch chats
    if (!stream) {
      await markRead(date) // opening a chat clears its unread badge
      setSelectedChatIndex(date)
    }
  }

  // Filter by the search query, then group by recency. While searching we keep the
  // grouping (results stay dated) — getMessageList already returns newest-first.
  const groups = useMemo(() => {
    const now = Date.now()
    const filtered = chatList.filter((c) => chatMatchesQuery(c, query))
    const byBucket = new Map<RecencyBucket, getDbReturn[]>()
    for (const c of filtered) {
      const b = recencyBucket(c.date, now)
      const arr = byBucket.get(b) ?? []
      arr.push(c)
      byBucket.set(b, arr)
    }
    return RECENCY_ORDER.filter((b) => byBucket.has(b)).map((b) => ({ bucket: b, chats: byBucket.get(b)! }))
  }, [chatList, query])

  const hasResults = groups.length > 0

  return (
    <div className={twMerge('flex flex-col gap-2 overflow-auto', className)} {...props}>
      {/* Search across chat titles + message content. */}
      <label className="relative flex items-center">
        <LuSearch className="pointer-events-none absolute left-2 opacity-50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search chats')}
          className="w-full rounded-lg bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-20 py-1.5 pl-8 pr-2 text-sm outline-none backdrop-blur"
        />
      </label>

      {!hasResults && (
        <p className="px-1 py-2 text-xs opacity-50">
          {query.trim() ? t('No chats match your search') : t('No chats yet')}
        </p>
      )}

      {groups.map(({ bucket, chats }) => (
        <div key={bucket} className="flex flex-col gap-2">
          <h2 className="px-1 pt-2 text-xs uppercase tracking-wide opacity-40">{t(bucket)}</h2>
          {chats.map((val) => (
            <Card
              key={val.date}
              onClick={() => handleClick(val.date)}
              className={`group relative cursor-pointer ${selectedChatIndex === val.date ? 'opacity-100' : 'opacity-50'} ${stream && 'cursor-default'} hover:opacity-100 transition-opacity`}
            >
              <ChatMenu date={val.date} className="absolute z-10 right-5 top-1/2 transform -translate-y-1/2 my-auto" />
              <h1 className={'group-hover:fade line-clamp-1 flex items-center gap-2'}>
                {val.unread && val.date !== selectedChatIndex && (
                  <span className="size-2 shrink-0 rounded-full bg-blue-500" title={t('Unread')} />
                )}
                {val.title || val.chat?.[0]?.content || t('Untitled chat')}
              </h1>
            </Card>
          ))}
        </div>
      ))}
    </div>
  )
}
