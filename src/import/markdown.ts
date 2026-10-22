import { marked } from 'marked'
import { importHtml } from './html'
import type { ImportPreview } from './types'
import { ImportError } from './types'

export interface MarkdownImportRequest {
  text: string
  original: ImportPreview['original']
  fileName?: string
  format?: 'md' | 'paste'
}

export function importMarkdown(request: MarkdownImportRequest): ImportPreview {
  if (!request.text.trim()) {
    throw new ImportError('The pasted content is empty.')
  }

  const html = marked.parse(request.text, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string

  const preview = importHtml({
    html,
    format: request.format ?? 'md',
    fileName: request.fileName,
    titleFallback: request.fileName ? undefined : 'Pasted research',
    original: request.original,
  })

  if (/<(?:script|style|iframe|object|embed)\b/i.test(request.text)) {
    preview.warnings.unshift({
      code: 'markdown-raw-html',
      message: 'Embedded HTML in the Markdown was sanitized before import.',
      severity: 'info',
    })
  }

  return preview
}
