import { useLocal } from '@renderer/hooks/useLocal'
import { useOllama } from '@renderer/hooks/useOllama'
import { modelListAtom, prefModelAtom } from '@renderer/store/mocks'
import { ModelCapabilities } from './ModelCapabilities'
import { cn, t } from '@renderer/utils/utils'
import { useAtomValue } from 'jotai'
import React, { ComponentProps, useEffect, useRef, useState } from 'react'
import { IoChevronDown } from 'react-icons/io5'
import { twMerge } from 'tailwind-merge'
import { filterModels } from '@renderer/utils/models'

export const ChooseModel = ({ className, ...props }: ComponentProps<'div'>): React.ReactElement => {
  const { listModels } = useOllama()
  const modelList = useAtomValue(modelListAtom)
  const { setModelChoice, setList } = useLocal()
  const prefModel = useAtomValue(prefModelAtom)

  // Type-to-filter combobox state. `query` is the filter text; the full list shows when it's empty.
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function list(): Promise<void> {
      const response = await listModels()
      if (!prefModel && response.length > 0) {
        setModelChoice(`${response[0].modelName}`)
      }
      setList(response)
    }
    list()
  }, [prefModel])

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = filterModels(modelList, query)

  function choose(modelName: string): void {
    setModelChoice(modelName)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className={twMerge('flex flex-col gap-2 justify-center', className)} {...props}>
      <h1 className="font-thin">{t('Choose a model :')}</h1>
      <div className="relative w-full max-w-[24rem]" ref={boxRef}>
        <input
          // When open, show what the user is typing; when closed, show the current model.
          value={open ? query : prefModel || ''}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && filtered.length > 0) {
              e.preventDefault()
              choose(filtered[0].modelName)
            }
          }}
          placeholder={t('Search models…')}
          className="h-16 w-full appearance-none rounded-full bg-foreground bg-opacity-20 p-5 pr-12 text-sm shadow-xl outline-none backdrop-blur-lg hover:bg-opacity-50 dark:bg-background dark:bg-opacity-20 dark:text-white dark:placeholder:opacity-60"
        />
        <IoChevronDown
          onClick={() => setOpen((v) => !v)}
          className="absolute right-5 top-1/2 -translate-y-1/2 transform cursor-pointer text-2xl"
        />
        {open && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl bg-background/90 p-1 shadow-xl backdrop-blur-lg">
            {filtered.length === 0 ? (
              <li className="px-4 py-2 text-sm opacity-60">{t('No matching models')}</li>
            ) : (
              filtered.map((val) => (
                <li key={val.modelName}>
                  <button
                    type="button"
                    onClick={() => choose(val.modelName)}
                    className={cn(
                      'w-full truncate rounded-xl px-4 py-2 text-left text-sm transition-colors hover:bg-foreground/10 dark:hover:bg-white/10',
                      val.modelName === prefModel && 'font-semibold'
                    )}
                  >
                    {val.modelName}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {/* capabilities of the selected model, so you know what it can/can't do (e.g. tools for Code mode) */}
      <ModelCapabilities model={prefModel} className="mt-1" />
    </div>
  )
}
