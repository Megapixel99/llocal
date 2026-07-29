import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { LuTrash2, LuBrain } from 'react-icons/lu'
import { memoriesAtom, type MemoryItem } from '@renderer/store/mocks'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

/**
 * View / add / delete cross-conversation memories. Memories are recalled into the
 * system prompt on every Chat-tab turn (see usePrompt) and synced across devices.
 * The assistant also captures them when you say "remember …".
 */
export const MemorySettings = (): React.ReactElement => {
  const [memories, setMemories] = useAtom(memoriesAtom)
  const [draft, setDraft] = useState('')

  function add(): void {
    const text = draft.trim()
    if (!text) return
    const id = globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}`
    setMemories((prev) =>
      prev.some((m) => m.text.toLowerCase() === text.toLowerCase())
        ? prev
        : [{ id, text, createdAt: Date.now() } as MemoryItem, ...prev]
    )
    setDraft('')
  }

  function remove(id: string): void {
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl w-full">
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg">
          <LuBrain /> {t('Memory')}
        </h2>
        <p className="text-xs opacity-60">
          {t(
            'Durable facts the assistant carries between chats. It also saves these automatically when you start a message with “remember …”.'
          )}
        </p>

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('Add something to remember…')}
            className={fieldClass}
          />
          <Button variant="primary" onClick={add} disabled={!draft.trim()}>
            {t('Add')}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {memories.length === 0 && <p className="text-xs opacity-50">{t('No memories yet.')}</p>}
          {memories.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-2 rounded-xl bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 p-2"
            >
              <span className="flex-1 text-sm">{m.text}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                title={t('Forget')}
                className="shrink-0 opacity-50 transition-opacity hover:text-red-500 hover:opacity-100"
              >
                <LuTrash2 />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
