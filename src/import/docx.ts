import mammoth from 'mammoth'
import { importHtml } from './html'
import type { ImportPreview, ImportWarning } from './types'
import { ImportError } from './types'
import { titleFromFileName } from './shared'

export async function importDocx(file: File): Promise<ImportPreview> {
  const arrayBuffer = await file.arrayBuffer()
  // The browser build reads arrayBuffer; the Node build used by tests reads buffer.
  const input = { arrayBuffer, buffer: new Uint8Array(arrayBuffer) }
  let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>
  try {
    result = await mammoth.convertToHtml(input)
  } catch (error) {
    throw new ImportError(
      `The DOCX file could not be read. ${error instanceof Error ? error.message : 'The file may be damaged.'}`,
    )
  }

  if (!result.value.trim()) {
    throw new ImportError('No readable content was found in this DOCX file.')
  }

  const warnings: ImportWarning[] = result.messages.map((message) => ({
    code: 'docx-message',
    severity: message.type === 'error' ? 'warning' : 'info',
    message: message.message,
  }))
  warnings.unshift({
    code: 'docx-fidelity',
    severity: 'info',
    message:
      'DOCX import keeps supported headings, text, lists, tables and embedded images. Complex layouts and floating objects may be simplified.',
  })

  const preview = importHtml({
    html: result.value,
    format: 'docx',
    fileName: file.name,
    titleFallback: titleFromFileName(file.name, 'Imported document'),
    original: {
      kind: 'file',
      fileName: file.name,
      mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      blob: file,
    },
  })

  preview.warnings = [...warnings, ...preview.warnings]
  return preview
}
