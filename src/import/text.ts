import type { Block } from '../model/schema'
import { newId } from '../model/ids'
import { htmlFromPlainText } from '../model/inline'
import type { ImportPreview } from './types'
import { ImportError } from './types'
import { buildImportStats, titleFromFileName } from './shared'

export interface TextImportRequest {
  text: string
  original: ImportPreview['original']
  fileName?: string
  format?: 'txt' | 'paste'
}

export function importText(request: TextImportRequest): ImportPreview {
  const text = request.text.replace(/\r\n?/g, '\n')
  if (!text.trim()) {
    throw new ImportError('The text file is empty.')
  }

  const format = request.format ?? 'txt'
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  const blocks: Block[] = chunks.map((chunk) => ({
    id: newId('blk'),
    type: 'paragraph',
    sourceRefs: [],
    metadata: {
      origin: 'import',
      importFormat: format,
      originalTag: '#text',
    },
    html: htmlFromPlainText(chunk),
  }))

  return {
    format,
    title: titleFromFileName(request.fileName, format === 'paste' ? 'Pasted text' : 'Imported text'),
    blocks,
    assets: [],
    assetBlobs: {},
    sources: [],
    warnings: [],
    stats: buildImportStats(blocks, 0),
    original: request.original,
  }
}
