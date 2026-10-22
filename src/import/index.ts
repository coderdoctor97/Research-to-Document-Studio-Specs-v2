import { importDocx } from './docx'
import { importHtml } from './html'
import { importMarkdown } from './markdown'
import { importPdf } from './pdf'
import { importText } from './text'
import type { ImportPreview } from './types'
import {
  ImportError,
  MAX_IMPORT_BYTES,
  formatFromFileName,
  resolveImportFormat,
} from './types'

export type PasteMode = 'markdown' | 'html' | 'text'

export async function importFile(file: File): Promise<ImportPreview> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError(
      `This file is larger than ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB. Split it or paste the relevant section.`,
    )
  }
  if (file.size === 0) {
    throw new ImportError('This file is empty.')
  }

  const format = formatFromFileName(file.name) ?? resolveImportFormat(file)
  if (!format) {
    throw new ImportError(
      'Unsupported file type. Import Markdown, HTML, TXT, DOCX, or a text-based PDF.',
    )
  }

  if (format === 'docx') return importDocx(file)
  if (format === 'pdf') return importPdf(file)

  const text = await file.text()
  const original: ImportPreview['original'] = {
    kind: 'file',
    fileName: file.name,
    mimeType: file.type,
    blob: file,
  }

  if (format === 'md') {
    return importMarkdown({ text, original, fileName: file.name })
  }
  if (format === 'html') {
    return importHtml({
      html: text,
      format: 'html',
      fileName: file.name,
      original,
    })
  }
  return importText({ text, original, fileName: file.name })
}

export function importPaste(mode: PasteMode, text: string): ImportPreview {
  if (!text.trim()) {
    throw new ImportError('Paste some content before previewing the import.')
  }
  const original: ImportPreview['original'] = { kind: 'paste', text }
  if (mode === 'html') {
    return importHtml({
      html: text,
      format: 'paste',
      original,
      titleFallback: 'Pasted HTML',
    })
  }
  if (mode === 'markdown') {
    return importMarkdown({ text, original, format: 'paste' })
  }
  return importText({ text, original, format: 'paste' })
}

export type { ImportPreview, ImportWarning } from './types'
export { ImportError, MAX_IMPORT_BYTES, SUPPORTED_EXTENSIONS } from './types'
