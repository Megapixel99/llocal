import { db } from '@renderer/utils/db'
import { Message, selectedChatIndexAtom, titleUpdateAtom } from '../store/mocks'
import { useAtom, useSetAtom } from 'jotai'
import { toast } from 'sonner';
import { t } from '@renderer/utils/utils';

export interface getDbReturn {
  date: string;
  title: string;
  chat: Message[];
  unread?: boolean;
}

type useDbReturn = {
  addChat: (messages: Message[], force?: boolean) => Promise<string>
  getMessageList: () => Promise<getDbReturn[]>
  getChat: (date?: string) => Promise<Message[]>
  updateDate: (date: string) => Promise<string>
  updateTitle: (date: string, title: string) => Promise<void>
  markRead: (date: string) => Promise<void>
  deleteChat: (date: string) => Promise<void>
}


export function useDb(): useDbReturn {
  const [selectedChatIndex, setSelectedChatIndex] = useAtom(selectedChatIndexAtom)
  const setTitleUpdate = useSetAtom(titleUpdateAtom)

  /* Force is to throw an error, so we can force fully add a new chat.
   * God bless coding, it so much fun
   * */
  const addNewChat = async (messages: Message[], title: string): Promise<string> => {
    const isoDateString = new Date().toISOString()
    const response = await db
      .collection('chat')
      .add({ date: isoDateString, title, chat: messages, unread: true })
      .then((chat) => console.log('AddChat (new): ', chat))
    setSelectedChatIndex(isoDateString)
    return response
  }

  const addChat = async (messages: Message[], force = false, title = ""): Promise<string> => {
    // New chat when there's no selected doc to continue (or when forced, e.g. branching).
    // NOTE: decide this explicitly rather than relying on .set/.update throwing — an empty
    // selectedChatIndex means "brand new chat", and .update() on a missing doc silently no-ops
    // (which previously meant new chats were never persisted / never showed in the list).
    if (force || !selectedChatIndex) {
      return addNewChat(messages, title)
    }
    try {
      // Continuing an existing chat: merge so we keep its title/date, and flag it unread.
      const response = await db
        .collection('chat')
        .doc({ date: selectedChatIndex })
        .update({ chat: messages, unread: true })
        .then((chat) => console.log('AddChat (update): ', chat))
      return response
    } catch (error) {
      // The selected doc vanished (e.g. deleted) — fall back to creating a fresh one.
      return addNewChat(messages, title)
    }
  }

  const getChat = async (date = ""): Promise<Message[]> => {
    const response: getDbReturn = await db.collection('chat').doc({ date: date || selectedChatIndex }).get()
    return response.chat
  }

  const deleteChat = async (date: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).delete()
      setSelectedChatIndex("") // this is incredibly important, because chat/chatlist state updates happen based on selectedChatIndex
      toast.success(t('The chat has been deleted'))
    } catch (error) {
      toast.error(t(`The chat could not be deleted due to the following error`) + `\n ${error}`)
    }
  }

  const getMessageList = async (): Promise<getDbReturn[]> => {
    const response = await db.collection('chat').orderBy('date').get()
    return response.reverse()
  }

  const updateDate = async (date: string): Promise<string> => {
    const currentDate = new Date()
    const isoDateString = currentDate.toISOString()
    const response: getDbReturn = await db.collection('chat').doc({ date: date }).set({ date: isoDateString })
    return response.date
  }

  const updateTitle = async (date: string, title: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).update({ title: title })
      // TODO: honestly, I'm unsure if there's a better way to do the state update here
      setTitleUpdate(new Date().getTime())
    } catch (error) {
      toast.error(String(error))
    }
  }

  // Clears the unread flag when the user opens a chat; bumps titleUpdate so ChatList re-fetches.
  const markRead = async (date: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).update({ unread: false })
      setTitleUpdate(new Date().getTime())
    } catch (error) {
      console.error(error)
    }
  }

  return { addChat, getMessageList, getChat, updateDate, updateTitle, markRead, deleteChat }
}
