import { db } from '@renderer/utils/db'
import { Message, selectedChatIndexAtom, sessionMetricsAtom, titleUpdateAtom } from '../store/mocks'
import type { MessageMetric } from '../../../shared/analytics'
import { useSetAtom, useStore } from 'jotai'
import { toast } from 'sonner';
import { t } from '@renderer/utils/utils';
import { isServerConfigured } from '@renderer/platform/config'
import { pushLocalChat, deleteRemoteChat, syncChats } from '@renderer/platform/chatSync'

export interface getDbReturn {
  date: string;
  title: string;
  chat: Message[];
  unread?: boolean;
  /** Per-message analytics for this chat, persisted so they survive reloads / chat switches. */
  metrics?: MessageMetric[];
  /** Server-clock timestamp of the last-synced version (present once synced). */
  updatedAt?: number;
  /** Local edits not yet confirmed pushed to the companion server. */
  dirty?: boolean;
}

type useDbReturn = {
  addChat: (messages: Message[], force?: boolean) => Promise<string>
  getMessageList: () => Promise<getDbReturn[]>
  getChat: (date?: string) => Promise<Message[]>
  getMetrics: (date?: string) => Promise<MessageMetric[]>
  updateDate: (date: string) => Promise<string>
  updateTitle: (date: string, title: string) => Promise<void>
  markRead: (date: string) => Promise<void>
  markUnread: (date: string) => Promise<void>
  deleteChat: (date: string) => Promise<void>
  /** Pull the companion server's chat changes into the local cache (no-op if no server). */
  syncNow: () => Promise<void>
}


export function useDb(): useDbReturn {
  const setSelectedChatIndex = useSetAtom(selectedChatIndexAtom)
  const setTitleUpdate = useSetAtom(titleUpdateAtom)
  // Read the selected index LIVE from the store rather than a render-time snapshot: a single
  // promptReq() run persists the chat twice (immediately on send, then again with the reply), and
  // the first call sets the index — the second must see that fresh value or it creates a duplicate.
  const store = useStore()

  /* Force is to throw an error, so we can force fully add a new chat.
   * God bless coding, it so much fun
   * */
  const addNewChat = async (messages: Message[], title: string): Promise<string> => {
    const isoDateString = new Date().toISOString()
    await db
      .collection('chat')
      // `dirty: true` until pushLocalChat confirms the mirror to the server.
      .add({ date: isoDateString, title, chat: messages, unread: true, metrics: store.get(sessionMetricsAtom), dirty: true })
      .then((chat) => console.log('AddChat (new): ', chat))
    setSelectedChatIndex(isoDateString)
    void pushLocalChat(isoDateString) // fire-and-forget mirror; UI never waits on the network
    return isoDateString
  }

  const addChat = async (messages: Message[], force = false, title = ""): Promise<string> => {
    const selectedChatIndex = store.get(selectedChatIndexAtom)
    // New chat when there's no selected doc to continue (or when forced, e.g. branching).
    // NOTE: decide this explicitly rather than relying on .set/.update throwing — an empty
    // selectedChatIndex means "brand new chat", and .update() on a missing doc silently no-ops
    // (which previously meant new chats were never persisted / never showed in the list).
    if (force || !selectedChatIndex) {
      return addNewChat(messages, title)
    }
    try {
      // Continuing an existing chat: merge so we keep its title/date, and flag it unread.
      await db
        .collection('chat')
        .doc({ date: selectedChatIndex })
        .update({ chat: messages, unread: true, metrics: store.get(sessionMetricsAtom), dirty: true })
        .then((chat) => console.log('AddChat (update): ', chat))
      void pushLocalChat(selectedChatIndex)
      return selectedChatIndex
    } catch (error) {
      // The selected doc vanished (e.g. deleted) — fall back to creating a fresh one.
      return addNewChat(messages, title)
    }
  }

  const getChat = async (date = ""): Promise<Message[]> => {
    const response: getDbReturn = await db.collection('chat').doc({ date: date || store.get(selectedChatIndexAtom) }).get()
    return response.chat
  }

  // Load a chat's saved per-message analytics (empty for older chats saved before metrics existed).
  const getMetrics = async (date = ""): Promise<MessageMetric[]> => {
    const response: getDbReturn = await db
      .collection('chat')
      .doc({ date: date || store.get(selectedChatIndexAtom) })
      .get()
    return response?.metrics ?? []
  }

  const deleteChat = async (date: string): Promise<void> => {
    try {
      // Delete on the server FIRST (a tombstone) so it can't be resurrected by the
      // next pull. If the server is unreachable we keep the local copy and report it,
      // rather than deleting locally and having it reappear on sync.
      await deleteRemoteChat(date)
      await db.collection('chat').doc({ date: date }).delete()
      setSelectedChatIndex("") // this is incredibly important, because chat/chatlist state updates happen based on selectedChatIndex
      toast.success(t('The chat has been deleted'))
    } catch (error) {
      toast.error(t(`The chat could not be deleted due to the following error`) + `\n ${error}`)
    }
  }

  const getMessageList = async (): Promise<getDbReturn[]> => {
    const response: getDbReturn[] = await db.collection('chat').orderBy('date').get()
    // Dedupe by `date` (the stable key) so the list can never render two cards with
    // the same React key — a defensive guard against any stray duplicate rows.
    const byDate = new Map<string, getDbReturn>()
    for (const doc of response) byDate.set(doc.date, doc)
    return [...byDate.values()].reverse()
  }

  const updateDate = async (date: string): Promise<string> => {
    const currentDate = new Date()
    const isoDateString = currentDate.toISOString()
    const response: getDbReturn = await db.collection('chat').doc({ date: date }).set({ date: isoDateString })
    return response.date
  }

  const updateTitle = async (date: string, title: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).update({ title: title, dirty: true })
      void pushLocalChat(date)
      // TODO: honestly, I'm unsure if there's a better way to do the state update here
      setTitleUpdate(new Date().getTime())
    } catch (error) {
      toast.error(String(error))
    }
  }

  // Clears the unread flag when the user opens a chat; bumps titleUpdate so ChatList re-fetches.
  const markRead = async (date: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).update({ unread: false, dirty: true })
      void pushLocalChat(date)
      setTitleUpdate(new Date().getTime())
    } catch (error) {
      console.error(error)
    }
  }

  // Flag a chat unread again (from the chat menu); bumps titleUpdate so the badge re-renders.
  const markUnread = async (date: string): Promise<void> => {
    try {
      await db.collection('chat').doc({ date: date }).update({ unread: true, dirty: true })
      void pushLocalChat(date)
      setTitleUpdate(new Date().getTime())
    } catch (error) {
      console.error(error)
    }
  }

  // Pull the companion server's chat changes into the local cache, then refresh the
  // list (bump titleUpdate) if anything changed. No-op when no server is configured.
  const syncNow = async (): Promise<void> => {
    if (!isServerConfigured()) return
    await syncChats(() => setTitleUpdate(new Date().getTime()))
  }

  return { addChat, getMessageList, getChat, getMetrics, updateDate, updateTitle, markRead, markUnread, deleteChat, syncNow }
}
