import { getOllama } from '@renderer/utils/ollama'
import { useEffect, useState } from 'react'
import { cn, t } from '@renderer/utils/utils'
import { LuCheck, LuX } from 'react-icons/lu'

// The capabilities we surface, in display order. Keys match Ollama's /api/show `capabilities` array.
// `completion` is omitted because every model has it (an always-✓ badge is just noise).
const CAPS: { key: string; label: string; hint: string }[] = [
  { key: 'tools', label: 'Tools', hint: 'Function calling — required for Code (agent) mode' },
  { key: 'vision', label: 'Vision', hint: 'Can read image attachments' },
  { key: 'audio', label: 'Audio', hint: 'Can process audio input' },
  { key: 'thinking', label: 'Thinking', hint: 'Native reasoning / chain-of-thought' },
  { key: 'insert', label: 'Insert', hint: 'Fill-in-the-middle completion' }
]

/**
 * Shows what the given model can and cannot do (✓ / ✗), read from Ollama's capabilities list.
 * Refetches whenever the model changes.
 * */
export const ModelCapabilities = ({
  model,
  className
}: {
  model: string
  className?: string
}): React.ReactElement | null => {
  const [caps, setCaps] = useState<string[] | null>(null)

  useEffect(() => {
    if (!model) {
      setCaps(null)
      return
    }
    let cancelled = false
    setCaps(null)
    getOllama()
      .show({ model })
      .then((info) => {
        if (!cancelled) setCaps((info as { capabilities?: string[] }).capabilities ?? [])
      })
      .catch(() => {
        if (!cancelled) setCaps([])
      })
    return () => {
      cancelled = true
    }
  }, [model])

  if (!model) return null
  if (caps === null) return <div className={cn('text-sm opacity-50', className)}>{t('Checking capabilities…')}</div>

  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {CAPS.map(({ key, label, hint }) => {
        const has = caps.includes(key)
        return (
          <span
            key={key}
            title={t(hint)}
            className={cn('flex items-center gap-1', has ? 'opacity-100' : 'opacity-50')}
          >
            {has ? <LuCheck className="text-emerald-400" /> : <LuX className="text-red-400" />}
            {t(label)}
          </span>
        )
      })}
    </div>
  )
}
