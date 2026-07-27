import { Button } from '@renderer/ui/Button'
import { Menu } from '@renderer/ui/Menu'
import { useStructureOutputs } from '@renderer/hooks/useStructuredOutputs'
import { useState } from 'react'
import { LuFileDown, LuLoader2 } from 'react-icons/lu'
import { toast } from 'sonner'
import {
  DOC_KINDS,
  DocxSpecSchema,
  PptxSpecSchema,
  XlsxSpecSchema,
  type DocKind
} from '../../../../../shared/doc-gen'

interface ExportDocumentProps {
  /** The assistant message to turn into a document. */
  text: string
}

/** The per-kind zod schema handed to the model as its structured-output format. */
const SCHEMA_FOR_KIND = {
  docx: DocxSpecSchema,
  pptx: PptxSpecSchema,
  xlsx: XlsxSpecSchema
} as const

/** A tailored instruction so the model returns the right shape for each format. */
function systemPromptFor(kind: DocKind): string {
  const shared =
    'You convert the given content into a structured document specification as JSON. ' +
    'Return ONLY the JSON object, no commentary. Use the exact schema provided.'
  switch (kind) {
    case 'docx':
      return `${shared} kind must be "docx". Break the content into blocks of type "heading" (with a level 1-6), "paragraph", or "list" (with items and optional ordered flag).`
    case 'pptx':
      return `${shared} kind must be "pptx". Split the content into slides, each with a short title and a few concise bullet points.`
    case 'xlsx':
      return `${shared} kind must be "xlsx". Extract any tabular data into one or more sheets, each with column headers and rows. Keep every row the same length as the columns.`
  }
}

/**
 * "Export → DOCX / PPTX / XLSX" affordance for an assistant message.
 *
 * Uses the model (via useStructureOutputs) to turn the message into a validated
 * document spec (src/shared/doc-gen.ts), then asks the main process to write the
 * file. Everything is opt-in and per-message.
 */
export const ExportDocument = ({ text }: ExportDocumentProps): React.ReactElement => {
  const { getStructuredResponse } = useStructureOutputs()
  const [isLoading, setLoading] = useState(false)

  async function handleExport(kind: DocKind): Promise<void> {
    if (isLoading) return
    setLoading(true)
    const id = toast.loading(`Generating ${kind.toUpperCase()}…`)
    try {
      const spec = await getStructuredResponse(text, SCHEMA_FOR_KIND[kind], systemPromptFor(kind))
      if (!spec) {
        toast.error('The model could not produce a valid document', { id })
        return
      }
      const savedPath = await window.api.docgenCreate(spec)
      if (savedPath) toast.success(`Saved to ${savedPath}`, { id })
      else toast.dismiss(id) // user cancelled the save dialog
    } catch (error) {
      toast.error(String(error), { id })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="icon" className="opacity-75" title="Export document" disabled={isLoading}>
          {isLoading ? <LuLoader2 className="animate-spin" /> : <LuFileDown />}
        </Button>
      </Menu.Trigger>
      <Menu.Content align="start">
        {DOC_KINDS.map(({ kind, label }) => (
          <Menu.Item key={kind} onSelect={() => handleExport(kind)}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  )
}
