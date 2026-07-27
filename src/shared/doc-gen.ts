/**
 * Platform-agnostic core for document generation (DOCX / PPTX / XLSX).
 *
 * This is the *inverse* of the RAG parsing pipeline (src/main/utils/docs-generator.ts):
 * instead of reading Office files, we describe one with a small intermediate
 * "document spec" and hand that spec to a builder that emits a real file.
 *
 * Like src/shared/commands.ts and src/shared/rag-core.ts, this module has NO
 * filesystem, Electron, DOM — AND no heavyweight document libraries (docx,
 * pptxgenjs, exceljs). It only defines + validates the spec and tolerantly
 * parses a model's JSON output into one. That keeps it fully unit-testable with
 * zero binary dependencies. The actual file building lives in
 * src/main/utils/doc-builder.ts, which imports the doc libraries.
 */

import { z } from 'zod'

// ---- DOCX ---------------------------------------------------------------

/** A single block within a Word document. */
export const DocxBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    /** 1 (largest) … 6 (smallest); defaults to 1 when omitted. */
    level: z.number().int().min(1).max(6).optional(),
    text: z.string()
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string()
  }),
  z.object({
    type: z.literal('list'),
    /** Numbered list when true, otherwise bulleted. */
    ordered: z.boolean().optional(),
    items: z.array(z.string())
  })
])
export type DocxBlock = z.infer<typeof DocxBlockSchema>

export const DocxSpecSchema = z.object({
  kind: z.literal('docx'),
  title: z.string(),
  blocks: z.array(DocxBlockSchema)
})

// ---- PPTX ---------------------------------------------------------------

export const PptxSlideSchema = z.object({
  title: z.string(),
  bullets: z.array(z.string()).default([])
})
export type PptxSlide = z.infer<typeof PptxSlideSchema>

export const PptxSpecSchema = z.object({
  kind: z.literal('pptx'),
  title: z.string(),
  slides: z.array(PptxSlideSchema)
})

// ---- XLSX ---------------------------------------------------------------

/** A single spreadsheet cell value. */
export const CellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type Cell = z.infer<typeof CellSchema>

export const XlsxSheetSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()).default([]),
  rows: z.array(z.array(CellSchema)).default([])
})
export type XlsxSheet = z.infer<typeof XlsxSheetSchema>

export const XlsxSpecSchema = z.object({
  kind: z.literal('xlsx'),
  title: z.string(),
  sheets: z.array(XlsxSheetSchema)
})

// ---- Union --------------------------------------------------------------

export const DocSpecSchema = z.discriminatedUnion('kind', [
  DocxSpecSchema,
  PptxSpecSchema,
  XlsxSpecSchema
])

export type DocxSpec = z.infer<typeof DocxSpecSchema>
export type PptxSpec = z.infer<typeof PptxSpecSchema>
export type XlsxSpec = z.infer<typeof XlsxSpecSchema>
export type DocSpec = z.infer<typeof DocSpecSchema>
export type DocKind = DocSpec['kind']

/** The three formats we can generate, in a shape handy for building UI menus. */
export const DOC_KINDS: readonly { kind: DocKind; label: string; ext: string }[] = [
  { kind: 'docx', label: 'Word (DOCX)', ext: 'docx' },
  { kind: 'pptx', label: 'PowerPoint (PPTX)', ext: 'pptx' },
  { kind: 'xlsx', label: 'Excel (XLSX)', ext: 'xlsx' }
] as const

/** Map a spec kind to its file extension. */
export function extForKind(kind: DocKind): string {
  return DOC_KINDS.find((k) => k.kind === kind)?.ext ?? kind
}

/**
 * Validate an already-parsed object against the spec.
 *
 * Throws a `ZodError` when invalid, so callers get a precise message. Prefer
 * this over calling `.parse` directly so the entry point is stable.
 */
export function validateDocSpec(value: unknown): DocSpec {
  return DocSpecSchema.parse(value)
}

/** Non-throwing variant, mirroring zod's `safeParse`. */
export function safeValidateDocSpec(value: unknown): z.SafeParseReturnType<unknown, DocSpec> {
  return DocSpecSchema.safeParse(value)
}

/**
 * Pull the first balanced JSON object/array out of arbitrary model text.
 *
 * Models routinely wrap JSON in ```json fenced blocks or add a sentence of
 * commentary before/after it. We first strip code fences, then scan for the
 * first `{`/`[` and walk to its matching close bracket (respecting strings and
 * escapes) so trailing junk is ignored. Returns the JSON substring or null.
 */
export function extractJsonBlock(raw: string): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()

  // Prefer the contents of a fenced code block when present.
  const fence = text.match(/```(?:json|javascript|js)?\s*\n?([\s\S]*?)```/i)
  if (fence && fence[1].trim()) {
    text = fence[1].trim()
  }

  const start = text.search(/[{[]/)
  if (start === -1) return null

  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Tolerantly parse a model's raw JSON output into a validated {@link DocSpec}.
 *
 * Handles plain JSON, ```json fenced blocks, and surrounding prose/trailing
 * junk. Throws an `Error` with a readable message when no valid spec can be
 * recovered (unparseable JSON, or JSON that fails schema validation).
 */
export function parseModelJson(raw: string): DocSpec {
  const json = extractJsonBlock(raw)
  if (!json) {
    throw new Error('No JSON object found in the model output')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Model output was not valid JSON')
  }

  const result = DocSpecSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Model output did not match a document spec: ${result.error.message}`)
  }
  return result.data
}

/**
 * Coerce a sheet's (possibly ragged) rows into a rectangular grid.
 *
 * The target width is the max of the column-header count and the widest data
 * row. Short rows are padded with `null`; there is no truncation, so no data is
 * lost. The header row is padded to the same width too. Returns a fresh object.
 */
export function normalizeSheet(sheet: XlsxSheet): XlsxSheet {
  const width = Math.max(
    sheet.columns.length,
    ...(sheet.rows.length ? sheet.rows.map((r) => r.length) : [0])
  )

  const pad = (row: Cell[]): Cell[] => {
    const out = row.slice(0, width)
    while (out.length < width) out.push(null)
    return out
  }

  const columns = sheet.columns.slice(0, width)
  while (columns.length < width) columns.push('')

  return {
    name: sheet.name,
    columns,
    rows: sheet.rows.map(pad)
  }
}

/** Apply {@link normalizeSheet} to every sheet of an xlsx spec. */
export function normalizeXlsxSpec(spec: XlsxSpec): XlsxSpec {
  return { ...spec, sheets: spec.sheets.map(normalizeSheet) }
}
