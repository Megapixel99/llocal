import { useState } from 'react'
import { useAtom } from 'jotai'
import { LuBookMarked, LuTrash2 } from 'react-icons/lu'
import { Portal, t } from '@renderer/utils/utils'
import { Card } from '@renderer/ui/Card'
import { Button } from '@renderer/ui/Button'
import { promptLibraryAtom, type SavedPrompt } from '@renderer/store/mocks'

interface PromptLibraryProps {
  /** Current composer text, offered as the body when saving a new prompt. */
  getCurrent: () => string
  /** Insert a saved prompt's body into the composer. */
  onInsert: (body: string) => void
}

/** A small local id without pulling in a uuid dep. */
function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `p_${Date.now()}_${Math.round(Math.random() * 1e6)}`)
}

/**
 * A reusable-prompt library (Claude-parity): save the current composer text under a
 * name, then insert saved prompts back into the composer. Synced across devices.
 */
export const PromptLibrary = ({ getCurrent, onInsert }: PromptLibraryProps): React.ReactElement => {
  const [prompts, setPrompts] = useAtom(promptLibraryAtom)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  function save(): void {
    const body = getCurrent().trim()
    const name = title.trim()
    if (!body || !name) return
    setPrompts((prev) => [{ id: newId(), title: name, body }, ...prev])
    setTitle('')
  }

  function remove(id: string): void {
    setPrompts((prev) => prev.filter((p) => p.id !== id))
  }

  function insert(p: SavedPrompt): void {
    onInsert(p.body)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('Prompt library')}
        className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
      >
        <LuBookMarked />
      </button>

      {open &&
        Portal(
          <>
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
            <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
              <Card className="flex w-[min(92vw,520px)] max-h-[85vh] flex-col gap-4 overflow-auto rounded-2xl p-4">
                <h2 className="flex items-center gap-2 font-bold">
                  <LuBookMarked /> {t('Prompt library')}
                </h2>

                {/* Save the current composer text. */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs opacity-70">{t('Save the current prompt')}</span>
                  <div className="flex gap-2">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('Name this prompt')}
                      className="flex-1 rounded-lg bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-20 px-3 py-2 text-sm outline-none backdrop-blur"
                    />
                    <Button variant="primary" onClick={save} disabled={!title.trim() || !getCurrent().trim()}>
                      {t('Save')}
                    </Button>
                  </div>
                  {!getCurrent().trim() && (
                    <span className="text-xs opacity-50">{t('Type something in the composer first.')}</span>
                  )}
                </div>

                {/* Saved prompts. */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs opacity-70">{t('Saved prompts')}</span>
                  {prompts.length === 0 && <p className="text-xs opacity-50">{t('No saved prompts yet.')}</p>}
                  {prompts.map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-start gap-2 rounded-xl bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 p-2"
                    >
                      <button
                        type="button"
                        onClick={() => insert(p)}
                        className="flex flex-1 flex-col items-start text-left"
                        title={t('Insert into composer')}
                      >
                        <span className="text-sm">{p.title}</span>
                        <span className="line-clamp-2 text-xs opacity-60">{p.body}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        title={t('Delete')}
                        className="shrink-0 opacity-50 transition-opacity hover:text-red-500 hover:opacity-100"
                      >
                        <LuTrash2 />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    {t('Close')}
                  </Button>
                </div>
              </Card>
            </div>
          </>
        )}
    </>
  )
}
