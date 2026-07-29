import React from 'react'
import { useAtom } from 'jotai'
import { customInstructionsAtom, responseStyleAtom } from '@renderer/store/mocks'
import { RESPONSE_STYLES } from '../../../../shared/styles'
import { t } from '@renderer/utils/utils'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

/**
 * Custom instructions (a persistent persona/preferences) + a response-style preset.
 * Both are combined into a system prompt prepended to Chat-tab requests (see
 * usePrompt + shared/styles.ts). Stored per-key and synced across devices.
 */
export const CustomInstructions = (): React.ReactElement => {
  const [instructions, setInstructions] = useAtom(customInstructionsAtom)
  const [style, setStyle] = useAtom(responseStyleAtom)

  return (
    <div className="flex flex-col gap-6 max-w-xl w-full">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Custom instructions')}</h2>
        <p className="text-xs opacity-60">
          {t(
            'Tell the model how to respond — your name, preferences, tone, formats to favor. Applied to every chat as a system prompt.'
          )}
        </p>
        <textarea
          className={`${fieldClass} min-h-[140px] resize-y`}
          value={instructions}
          placeholder={t(
            'e.g. I’m a TypeScript developer. Prefer concise answers with code first, then a short explanation.'
          )}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Response style')}</h2>
        <p className="text-xs opacity-60">
          {t('A quick preset layered on top of your custom instructions.')}
        </p>
        <div className="flex flex-col gap-2">
          {RESPONSE_STYLES.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-all ${
                style === s.id
                  ? 'bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-30'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <input
                type="radio"
                name="responseStyle"
                className="mt-1 shrink-0"
                checked={style === s.id}
                onChange={() => setStyle(s.id)}
              />
              <span className="flex flex-col">
                <span className="text-sm">{t(s.label)}</span>
                <span className="text-xs opacity-60">{t(s.description)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
