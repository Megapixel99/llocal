/**
 * Platform-agnostic Ollama model catalogue core.
 *
 * This module powers the "browse the Ollama library" experience in Settings.
 * Like src/shared/commands.ts and src/shared/rag-core.ts it has NO Electron,
 * DOM or network dependency — it only holds a curated static catalogue and pure
 * functions to search / filter / sort it, plus normalizers that turn a fetched
 * ollama.com/library page (HTML or JSON) into the same shape.
 *
 * The static CATALOG is the offline source of truth: if a live fetch fails or
 * returns garbage, callers fall back to it. For that reason every normalizer
 * MUST return [] on unusable input instead of throwing.
 */

/** A single model in the catalogue (one entry per Ollama library name). */
export interface CatalogModel {
  /** Ollama library name used verbatim for `ollama pull`, e.g. "llama3.2". */
  name: string
  /** Model family / vendor grouping, e.g. "llama", "qwen", "gemma". */
  family: string
  /** Short human-readable blurb. */
  description: string
  /** Parameter sizes offered, e.g. ["1b", "3b"]. */
  params: string[]
  /** Pullable tag sizes, e.g. ["1b", "3b", "latest"]. */
  sizes: string[]
  /** Capability tags, e.g. 'vision' | 'code' | 'embedding' | 'tools' | 'small'. */
  tags: string[]
  /** Approximate pull count (popularity), when known. */
  pulls?: number
}

/** Known capability tag vocabulary (informational — filtering accepts any tag). */
export const CAPABILITY_TAGS = [
  'vision',
  'code',
  'embedding',
  'tools',
  'small',
  'reasoning',
  'chat'
] as const

/** Fields we can sort the catalogue by. */
export type SortBy = 'name' | 'popularity'

/**
 * Curated static catalogue of popular Ollama library models.
 * Offline fallback — kept intentionally small and hand-maintained. Pull counts
 * are approximate and only used for relative popularity ordering.
 */
export const CATALOG: CatalogModel[] = [
  {
    name: 'llama3.2',
    family: 'llama',
    description: "Meta's Llama 3.2 — small, fast general-purpose models with tool support.",
    params: ['1b', '3b'],
    sizes: ['1b', '3b', 'latest'],
    tags: ['tools', 'small', 'chat'],
    pulls: 15000000
  },
  {
    name: 'llama3.1',
    family: 'llama',
    description: "Meta's Llama 3.1 — capable general-purpose models with tool calling.",
    params: ['8b', '70b', '405b'],
    sizes: ['8b', '70b', '405b', 'latest'],
    tags: ['tools', 'chat'],
    pulls: 24000000
  },
  {
    name: 'llama3.3',
    family: 'llama',
    description: "Meta's Llama 3.3 70B — 405B-class quality at a smaller size.",
    params: ['70b'],
    sizes: ['70b', 'latest'],
    tags: ['tools', 'chat'],
    pulls: 3000000
  },
  {
    name: 'phi3',
    family: 'phi',
    description: "Microsoft's Phi-3 — lightweight, state-of-the-art small models.",
    params: ['3.8b', '14b'],
    sizes: ['mini', 'medium', 'latest'],
    tags: ['small', 'chat'],
    pulls: 5000000
  },
  {
    name: 'phi3.5',
    family: 'phi',
    description: "Microsoft's Phi-3.5 — refreshed lightweight 3.8B model.",
    params: ['3.8b'],
    sizes: ['3.8b', 'latest'],
    tags: ['small', 'chat'],
    pulls: 2500000
  },
  {
    name: 'phi4',
    family: 'phi',
    description: "Microsoft's Phi-4 14B — strong reasoning for its size.",
    params: ['14b'],
    sizes: ['14b', 'latest'],
    tags: ['reasoning', 'chat'],
    pulls: 1800000
  },
  {
    name: 'mistral',
    family: 'mistral',
    description: "Mistral 7B — a fast, popular general-purpose model with tool support.",
    params: ['7b'],
    sizes: ['7b', 'latest'],
    tags: ['tools', 'chat'],
    pulls: 12000000
  },
  {
    name: 'mistral-nemo',
    family: 'mistral',
    description: 'Mistral NeMo 12B — a larger multilingual model built with NVIDIA.',
    params: ['12b'],
    sizes: ['12b', 'latest'],
    tags: ['tools', 'chat'],
    pulls: 2000000
  },
  {
    name: 'mixtral',
    family: 'mistral',
    description: 'Mixtral — high-quality sparse mixture-of-experts models.',
    params: ['8x7b', '8x22b'],
    sizes: ['8x7b', '8x22b', 'latest'],
    tags: ['tools', 'chat'],
    pulls: 3500000
  },
  {
    name: 'gemma2',
    family: 'gemma',
    description: "Google's Gemma 2 — efficient open models in three sizes.",
    params: ['2b', '9b', '27b'],
    sizes: ['2b', '9b', '27b', 'latest'],
    tags: ['small', 'chat'],
    pulls: 8000000
  },
  {
    name: 'gemma3',
    family: 'gemma',
    description: "Google's Gemma 3 — multimodal open models with vision.",
    params: ['1b', '4b', '12b', '27b'],
    sizes: ['1b', '4b', '12b', '27b', 'latest'],
    tags: ['vision', 'small', 'chat'],
    pulls: 4000000
  },
  {
    name: 'qwen2.5',
    family: 'qwen',
    description: "Alibaba's Qwen2.5 — strong multilingual models with tool calling.",
    params: ['0.5b', '1.5b', '3b', '7b', '14b', '32b', '72b'],
    sizes: ['0.5b', '1.5b', '3b', '7b', '14b', '32b', '72b', 'latest'],
    tags: ['tools', 'small', 'chat'],
    pulls: 9000000
  },
  {
    name: 'qwen2.5-coder',
    family: 'qwen',
    description: 'Qwen2.5-Coder — code-specialized models for generation and completion.',
    params: ['0.5b', '1.5b', '3b', '7b', '14b', '32b'],
    sizes: ['0.5b', '1.5b', '3b', '7b', '14b', '32b', 'latest'],
    tags: ['code', 'small', 'tools'],
    pulls: 6000000
  },
  {
    name: 'qwen3',
    family: 'qwen',
    description: 'Qwen3 — latest Qwen generation with hybrid reasoning modes.',
    params: ['0.6b', '1.7b', '4b', '8b', '14b', '32b'],
    sizes: ['0.6b', '1.7b', '4b', '8b', '14b', '32b', 'latest'],
    tags: ['reasoning', 'tools', 'small', 'chat'],
    pulls: 5000000
  },
  {
    name: 'deepseek-r1',
    family: 'deepseek',
    description: 'DeepSeek-R1 — open reasoning models with visible chain-of-thought.',
    params: ['1.5b', '7b', '8b', '14b', '32b', '70b', '671b'],
    sizes: ['1.5b', '7b', '8b', '14b', '32b', '70b', '671b', 'latest'],
    tags: ['reasoning', 'small', 'chat'],
    pulls: 20000000
  },
  {
    name: 'deepseek-coder-v2',
    family: 'deepseek',
    description: 'DeepSeek-Coder-V2 — mixture-of-experts code models.',
    params: ['16b', '236b'],
    sizes: ['16b', '236b', 'latest'],
    tags: ['code', 'chat'],
    pulls: 2500000
  },
  {
    name: 'deepseek-coder',
    family: 'deepseek',
    description: 'DeepSeek-Coder — code models trained on 2T code + natural language tokens.',
    params: ['1.3b', '6.7b', '33b'],
    sizes: ['1.3b', '6.7b', '33b', 'latest'],
    tags: ['code', 'small'],
    pulls: 3000000
  },
  {
    name: 'codellama',
    family: 'llama',
    description: "Meta's Code Llama — code generation and completion models.",
    params: ['7b', '13b', '34b', '70b'],
    sizes: ['7b', '13b', '34b', '70b', 'latest'],
    tags: ['code'],
    pulls: 4500000
  },
  {
    name: 'codegemma',
    family: 'gemma',
    description: "Google's CodeGemma — code models for completion and generation.",
    params: ['2b', '7b'],
    sizes: ['2b', '7b', 'latest'],
    tags: ['code', 'small'],
    pulls: 1500000
  },
  {
    name: 'llava',
    family: 'llava',
    description: 'LLaVA — multimodal vision-language models that can read images.',
    params: ['7b', '13b', '34b'],
    sizes: ['7b', '13b', '34b', 'latest'],
    tags: ['vision', 'chat'],
    pulls: 6000000
  },
  {
    name: 'llava-llama3',
    family: 'llava',
    description: 'LLaVA fine-tuned on Llama 3 — improved vision-language reasoning.',
    params: ['8b'],
    sizes: ['8b', 'latest'],
    tags: ['vision', 'chat'],
    pulls: 1200000
  },
  {
    name: 'moondream',
    family: 'moondream',
    description: 'Moondream 2 — a tiny vision model that runs on modest hardware.',
    params: ['1.8b'],
    sizes: ['1.8b', 'latest'],
    tags: ['vision', 'small'],
    pulls: 1000000
  },
  {
    name: 'minicpm-v',
    family: 'minicpm',
    description: 'MiniCPM-V — efficient vision-language model for single images and OCR.',
    params: ['8b'],
    sizes: ['8b', 'latest'],
    tags: ['vision', 'small'],
    pulls: 800000
  },
  {
    name: 'nomic-embed-text',
    family: 'nomic',
    description: 'Nomic Embed — a high-performing open text embedding model.',
    params: ['137m'],
    sizes: ['latest'],
    tags: ['embedding', 'small'],
    pulls: 9000000
  },
  {
    name: 'mxbai-embed-large',
    family: 'mixedbread',
    description: 'mxbai-embed-large — a state-of-the-art large text embedding model.',
    params: ['335m'],
    sizes: ['latest'],
    tags: ['embedding', 'small'],
    pulls: 3000000
  },
  {
    name: 'all-minilm',
    family: 'sentence-transformers',
    description: 'all-MiniLM — compact sentence embeddings (used by LLocal web search & files).',
    params: ['22m', '33m'],
    sizes: ['22m', '33m', 'latest'],
    tags: ['embedding', 'small'],
    pulls: 2500000
  },
  {
    name: 'snowflake-arctic-embed',
    family: 'snowflake',
    description: "Snowflake's Arctic Embed — text embedding models tuned for retrieval.",
    params: ['22m', '33m', '110m', '137m', '335m'],
    sizes: ['22m', '33m', '110m', '137m', '335m', 'latest'],
    tags: ['embedding', 'small'],
    pulls: 900000
  },
  {
    name: 'starcoder2',
    family: 'starcoder',
    description: 'StarCoder2 — open code models trained on The Stack v2.',
    params: ['3b', '7b', '15b'],
    sizes: ['3b', '7b', '15b', 'latest'],
    tags: ['code', 'small'],
    pulls: 1300000
  },
  {
    name: 'tinyllama',
    family: 'llama',
    description: 'TinyLlama — a compact 1.1B model for constrained environments.',
    params: ['1.1b'],
    sizes: ['1.1b', 'latest'],
    tags: ['small', 'chat'],
    pulls: 2000000
  }
]

/** Lower-case + trim helper used across the search/filter functions. */
function norm(value: string): string {
  return value.toLowerCase().trim()
}

/**
 * Case-insensitive substring search across name, family, description and tags.
 * An empty / whitespace query returns the catalogue unchanged (a copy).
 */
export function searchCatalog(catalog: CatalogModel[], query: string): CatalogModel[] {
  const q = norm(query ?? '')
  if (!q) return [...catalog]
  return catalog.filter((model) => {
    const haystack = [
      model.name,
      model.family,
      model.description,
      ...model.tags
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

/**
 * Keep only models that carry EVERY requested tag (AND semantics).
 * An empty tag list returns the catalogue unchanged (a copy). Tag matching is
 * case-insensitive.
 */
export function filterByTags(catalog: CatalogModel[], tags: string[]): CatalogModel[] {
  const wanted = (tags ?? []).map(norm).filter(Boolean)
  if (!wanted.length) return [...catalog]
  return catalog.filter((model) => {
    const owned = new Set(model.tags.map(norm))
    return wanted.every((tag) => owned.has(tag))
  })
}

/**
 * Return a new sorted array. 'name' sorts alphabetically (A→Z); 'popularity'
 * sorts by descending pull count (unknown pulls treated as 0), with name as a
 * stable tie-breaker. The input array is not mutated.
 */
export function sortCatalog(catalog: CatalogModel[], by: SortBy): CatalogModel[] {
  const copy = [...catalog]
  if (by === 'popularity') {
    copy.sort((a, b) => {
      const diff = (b.pulls ?? 0) - (a.pulls ?? 0)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name))
  }
  return copy
}

/** Distinct capability tags present in a catalogue, sorted alphabetically. */
export function collectTags(catalog: CatalogModel[]): string[] {
  const set = new Set<string>()
  for (const model of catalog) {
    for (const tag of model.tags) set.add(norm(tag))
  }
  return Array.from(set).sort()
}

/** Coerce an unknown value into a clean string[] (used while normalizing). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter(Boolean)
}

/**
 * Normalize an already-parsed library payload (e.g. JSON from an API or a
 * scraper) into CatalogModel[]. Accepts either an array of model-ish objects or
 * an object with a `models` array. Anything unusable yields [] so callers can
 * fall back to the static CATALOG — this function never throws.
 */
export function normalizeLibrary(data: unknown): CatalogModel[] {
  try {
    let items: unknown[]
    if (Array.isArray(data)) {
      items = data
    } else if (data && typeof data === 'object' && Array.isArray((data as { models?: unknown[] }).models)) {
      items = (data as { models: unknown[] }).models
    } else {
      return []
    }

    const out: CatalogModel[] = []
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue
      const obj = raw as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) continue

      const tags = toStringArray(obj.tags ?? obj.capabilities)
      const sizes = toStringArray(obj.sizes)
      const params = toStringArray(obj.params ?? obj.parameters ?? sizes)
      const family =
        typeof obj.family === 'string' && obj.family.trim()
          ? obj.family.trim()
          : name.split(/[-:.]/)[0]
      const description = typeof obj.description === 'string' ? obj.description.trim() : ''
      const pullsRaw = obj.pulls ?? obj.pull_count
      const pulls = typeof pullsRaw === 'number' && Number.isFinite(pullsRaw) ? pullsRaw : undefined

      out.push({
        name,
        family,
        description,
        params,
        sizes,
        tags,
        ...(pulls !== undefined ? { pulls } : {})
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Best-effort scraper for an ollama.com/library HTML listing.
 *
 * The library page renders one <li>/<a href="/library/<name>"> per model with a
 * description and capability pills. We extract library names via the anchor
 * hrefs and pull nearby text as the description. This is deliberately lenient:
 * on any unusable input it returns [] so the caller uses the static catalogue.
 */
export function parseLibraryHtml(html: string): CatalogModel[] {
  try {
    if (typeof html !== 'string' || !html.includes('/library/')) return []

    const seen = new Set<string>()
    const models: CatalogModel[] = []
    // Match anchors that link to a specific library model page.
    const anchorRe = /<a[^>]+href="\/library\/([a-z0-9][a-z0-9._-]*)"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    while ((match = anchorRe.exec(html)) !== null) {
      const name = match[1].trim()
      if (!name || seen.has(name)) continue
      seen.add(name)

      const inner = match[2]
      // Strip tags from the anchor's inner HTML to recover a text description.
      const text = inner
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()

      // Heuristic capability tags from any pill text in the anchor.
      const lower = inner.toLowerCase()
      const tags: string[] = []
      for (const cap of CAPABILITY_TAGS) {
        if (lower.includes(cap)) tags.push(cap)
      }

      models.push({
        name,
        family: name.split(/[-:.]/)[0],
        description: text,
        params: [],
        sizes: [],
        tags
      })
    }
    return models
  } catch {
    return []
  }
}
