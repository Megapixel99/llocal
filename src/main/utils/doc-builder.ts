/**
 * Turn a validated document spec (src/shared/doc-gen.ts) into a real Office file.
 *
 * This is the *inverse* of docs-generator.ts (which parses Office files for RAG).
 * It is the ONLY place the heavyweight document libraries are imported, keeping
 * the shared spec/validation core dependency-free and unit-testable.
 *
 * `buildDocument` returns a Buffer; `saveDocument` writes it to disk (via a save
 * dialog, falling back to the OS downloads directory) and returns the path.
 */

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import PptxGenJS from 'pptxgenjs'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { dialog } from 'electron'
import {
  type DocSpec,
  type DocxSpec,
  type PptxSpec,
  type XlsxSpec,
  extForKind,
  normalizeXlsxSpec,
  validateDocSpec
} from '../../shared/doc-gen'

const DOCX_HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
] as const

async function buildDocx(spec: DocxSpec): Promise<Buffer> {
  const children: Paragraph[] = []

  // Document title as the top heading.
  if (spec.title.trim()) {
    children.push(new Paragraph({ text: spec.title, heading: HeadingLevel.TITLE }))
  }

  for (const block of spec.blocks) {
    if (block.type === 'heading') {
      const level = block.level ?? 1
      children.push(
        new Paragraph({ text: block.text, heading: DOCX_HEADINGS[level - 1] })
      )
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ children: [new TextRun(block.text)] }))
    } else {
      // list
      block.items.forEach((item) => {
        children.push(
          new Paragraph(
            block.ordered
              ? { text: item, numbering: { reference: 'ordered-list', level: 0 } }
              : { text: item, bullet: { level: 0 } }
          )
        )
      })
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }]
        }
      ]
    },
    sections: [{ children }]
  })

  return Packer.toBuffer(doc)
}

async function buildPptx(spec: PptxSpec): Promise<Buffer> {
  const pptx = new PptxGenJS()
  if (spec.title.trim()) pptx.title = spec.title

  // Title slide.
  const cover = pptx.addSlide()
  cover.addText(spec.title || 'Presentation', {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 1.5,
    fontSize: 32,
    bold: true,
    align: 'center'
  })

  for (const slide of spec.slides) {
    const s = pptx.addSlide()
    s.addText(slide.title, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true })
    if (slide.bullets.length) {
      s.addText(
        slide.bullets.map((text) => ({ text, options: { bullet: true } })),
        { x: 0.7, y: 1.3, w: 8.6, h: 4.5, fontSize: 16 }
      )
    }
  }

  // pptxgenjs returns a Node Buffer when compression target is 'nodebuffer'.
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return out
}

async function buildXlsx(specIn: XlsxSpec): Promise<Buffer> {
  const spec = normalizeXlsxSpec(specIn)
  const wb = new ExcelJS.Workbook()

  const sheets = spec.sheets.length ? spec.sheets : [{ name: 'Sheet1', columns: [], rows: [] }]
  sheets.forEach((sheet, idx) => {
    // Excel sheet names must be <=31 chars and unique.
    const name = (sheet.name || `Sheet${idx + 1}`).slice(0, 31)
    const ws = wb.addWorksheet(name || `Sheet${idx + 1}`)
    if (sheet.columns.length) {
      const header = ws.addRow(sheet.columns)
      header.font = { bold: true }
    }
    for (const row of sheet.rows) {
      ws.addRow(row.map((cell) => (cell === null ? '' : cell)))
    }
  })

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}

/** Build the in-memory file for a validated spec. Throws on unknown kinds. */
export async function buildDocument(spec: DocSpec): Promise<Buffer> {
  switch (spec.kind) {
    case 'docx':
      return buildDocx(spec)
    case 'pptx':
      return buildPptx(spec)
    case 'xlsx':
      return buildXlsx(spec)
    default: {
      const _exhaustive: never = spec
      throw new Error(`Unsupported document kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/** Turn a spec title into a filesystem-safe base filename. */
export function safeFileName(title: string, kind: DocSpec['kind']): string {
  const base = (title || 'document')
    .replace(/[^\w\-. ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${base || 'document'}.${extForKind(kind)}`
}

/**
 * Validate + build a spec and write it to disk.
 *
 * Shows a save dialog when a window is available; if cancelled returns null. In
 * headless contexts (no dialog) it falls back to writing into `downloadsDir`.
 * Returns the absolute path written, or null if the user cancelled.
 */
export async function saveDocument(
  rawSpec: unknown,
  downloadsDir: string
): Promise<string | null> {
  const spec = validateDocSpec(rawSpec)
  const buffer = await buildDocument(spec)
  const defaultName = safeFileName(spec.title, spec.kind)

  let target: string | undefined
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save document',
      defaultPath: path.join(downloadsDir, defaultName),
      filters: [{ name: spec.kind.toUpperCase(), extensions: [extForKind(spec.kind)] }]
    })
    if (canceled) return null
    target = filePath
  } catch {
    // No dialog (e.g. headless) — fall back to downloads.
    target = path.join(downloadsDir, defaultName)
  }

  if (!target) return null
  await fs.promises.writeFile(target, buffer)
  return target
}
