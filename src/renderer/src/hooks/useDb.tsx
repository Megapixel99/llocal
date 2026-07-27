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
  const addChat = async (messages: Message[], force = false, title = ""): Promise<string> => {
    try {
      if (force) throw new Error("Forcefully add a new chat")
      // .update (instead of .set) merges, so it preserves the chat's existing title/date instead of
      // wiping the title back to "" on every new message. Throws if the doc doesn't exist -> new chat.
      const response = await db
        .collection('chat')
        .doc({ date: selectedChatIndex })
        .update({
          chat: messages,
          unread: true
        })
        .then((chat) => console.log('AddChat: ', chat))
      return response
    } catch (error) {
      const currentDate = new Date()
      const isoDateString = currentDate.toISOString()
      const response = await db
        .collection('chat')
        .add({
          date: isoDateString,
          title: title,
          chat: messages,
          unread: true
        })
        .then((chat) => console.log('AddChat: ', chat))
      setSelectedChatIndex(isoDateString)
      return response
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
