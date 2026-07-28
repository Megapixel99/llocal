import { useDb } from '@renderer/hooks/useDb'
import {
  chatAtom,
  selectedChatIndexAtom,
  sessionMetricsAtom,
} from '@renderer/store/mocks'
import { useAtom, useSetAtom } from 'jotai'
import React, { ComponentProps, useEffect, useRef } from 'react'
import { twMerge } from 'tailwind-merge'
import 'react-loading-skeleton/dist/skeleton.css'
import { AiMessage, UserMessage } from '@renderer/ui/Message'
import { StreamingMessage } from './Messages/StreamingMessage'

export const Messages = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const [chat, setChat] = useAtom(chatAtom)
  const [selectedChatIndex] = useAtom(selectedChatIndexAtom)
  const setSessionMetrics = useSetAtom(sessionMetricsAtom)
  const { getChat, getMetrics } = useDb()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  useEffect(() => {
    // Load the opened chat's messages AND its saved analytics, so the analytics panel reflects the
    // chat you're viewing (and survives reloads) rather than only the live in-memory session.
    async function getApi(): Promise<void> {
      const [messages, metrics] = await Promise.all([getChat(), getMetrics()])
      setChat(messages)
      setSessionMetrics(metrics)
    }
    if (selectedChatIndex) {
      getApi()
    } else {
      setChat([]) // this required because when the chat is deleted then the state also must clear
    }
  }, [selectedChatIndex])

  return (
    <div
      className={twMerge('flex flex-col gap-2 w-full md:max-w-3xl mb-5 overflow-y-auto', className)}
      {...props}
    >
      {chat &&
        chat.map((val, index) => {

          // console.log(val.content)
          return val.role == 'user' ? (
            <UserMessage message={val.content} index={index} key={index} />) : <AiMessage key={index} index={index} message={val.content} />
        })}
      <StreamingMessage />
      <div ref={scrollRef}></div>
    </div>
  )
}
