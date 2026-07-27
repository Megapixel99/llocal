import { Card } from '@renderer/ui/Card'
import { Button } from '@renderer/ui/Button'
import { Input } from '@renderer/ui/Input'
import { ComponentProps, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PiMagnifyingGlassFill, PiDownloadSimpleBold } from 'react-icons/pi'
import { twMerge } from 'tailwind-merge'
import { useOllama } from '@renderer/hooks/useOllama'
import { t } from '@renderer/utils/utils'
import {
  CATALOG,
  collectTags,
  filterByTags,
  parseLibraryHtml,
  searchCatalog,
  sortCatalog,
  type CatalogModel,
  type SortBy
} from '../../../../shared/model-catalogue'

type SearchFields = { query?: string }

/**
 * Optionally enrich the static catalogue with the live Ollama library. This is
 * best-effort and non-blocking: on ANY failure (network, CORS, bad markup) it
 * resolves to the untouched static catalogue. Curated static entries always win
 * on their rich metadata; genuinely new library names are appended.
 */
async function loadCatalogue(): Promise<CatalogModel[]> {
  try {
    const res = await fetch('https://ollama.com/library')
    if (!res.ok) return CATALOG
    const html = await res.text()
    const fetched = parseLibraryHtml(html)
    if (!fetched.length) return CATALOG
    const known = new Set(CATALOG.map((m) => m.name))
    const extra = fetched.filter((m) => !known.has(m.name))
    return extra.length ? [...CATALOG, ...extra] : CATALOG
  } catch {
    return CATALOG
  }
}

/** Format a big pull count as e.g. "24M" / "900K". */
function formatPulls(pulls?: number): string | null {
  if (!pulls || pulls <= 0) return null
  if (pulls >= 1_000_000) return `${Math.round(pulls / 100_000) / 10}M`
  if (pulls >= 1_000) return `${Math.round(pulls / 1_000)}K`
  return String(pulls)
}

const ModelCard = ({
  model,
  onPull,
  disabled
}: {
  model: CatalogModel
  onPull: (name: string) => void
  disabled: boolean
}): React.ReactElement => {
  const pulls = formatPulls(model.pulls)
  return (
    <Card className="flex flex-col gap-2 p-4 rounded-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <p className="font-medium break-all">{model.name}</p>
          <p className="text-xs opacity-50">{model.family}</p>
        </div>
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onPull(model.name)}
          className="flex items-center gap-1 text-xs whitespace-nowrap"
        >
          <PiDownloadSimpleBold /> {t('Pull')}
        </Button>
      </div>
      {model.description && (
        <p className="text-xs opacity-70 leading-snug">{model.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {model.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-background dark:bg-foreground bg-opacity-20 dark:bg-opacity-20"
          >
            {tag}
          </span>
        ))}
      </div>
      {model.sizes.length > 0 && (
        <p className="text-[10px] opacity-50">
          {t('Sizes')}: {model.sizes.join(', ')}
        </p>
      )}
      {pulls && <p className="text-[10px] opacity-40">{pulls} {t('pulls')}</p>}
    </Card>
  )
}

export const ModelCatalogue = ({
  className,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  const { register, watch } = useForm<SearchFields>()
  const query = watch('query') ?? ''
  const { pullModel } = useOllama()

  const [catalogue, setCatalogue] = useState<CatalogModel[]>(CATALOG)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('popularity')
  const [pulling, setPulling] = useState(false)

  // Best-effort live enrichment; falls back to the static catalogue on failure.
  useEffect(() => {
    let alive = true
    loadCatalogue().then((list) => {
      if (alive) setCatalogue(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const allTags = useMemo(() => collectTags(catalogue), [catalogue])

  const results = useMemo(() => {
    const searched = searchCatalog(catalogue, query)
    const filtered = filterByTags(searched, activeTags)
    return sortCatalog(filtered, sortBy)
  }, [catalogue, query, activeTags, sortBy])

  function toggleTag(tag: string): void {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag]
    )
  }

  async function handlePull(name: string): Promise<void> {
    setPulling(true)
    // Reuse the exact same pull flow (with its streamed toast progress) as the
    // manual pull-by-name input.
    await pullModel(name)
    setPulling(false)
  }

  return (
    <div className={twMerge('flex flex-col gap-3', className)} {...props}>
      {/* Search box */}
      <div className="relative">
        <Input
          name="query"
          register={register}
          className="h-auto w-full"
          placeholder={t('Search the model catalogue…')}
        />
        <PiMagnifyingGlassFill className="text-xl absolute right-5 top-1/2 transform -translate-y-1/2 opacity-60" />
      </div>

      {/* Tag filter chips + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {allTags.map((tag) => {
          const active = activeTags.includes(tag)
          return (
            <Button
              key={tag}
              variant="breadcrumb"
              onClick={() => toggleTag(tag)}
              className={twMerge(
                'border-[1px] border-background dark:border-foreground border-opacity-10 dark:border-opacity-10',
                active && 'opacity-100 bg-background dark:bg-foreground bg-opacity-20 dark:bg-opacity-20'
              )}
            >
              {tag}
            </Button>
          )
        })}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="ml-auto text-xs bg-transparent outline-none opacity-70 cursor-pointer"
        >
          <option value="popularity">{t('Popularity')}</option>
          <option value="name">{t('Name')}</option>
        </select>
      </div>

      {/* Results grid */}
      {results.length === 0 ? (
        <p className="text-xs opacity-50 py-4">{t('No models match your search.')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[26rem] overflow-y-auto pr-1">
          {results.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              onPull={handlePull}
              disabled={pulling}
            />
          ))}
        </div>
      )}
    </div>
  )
}
