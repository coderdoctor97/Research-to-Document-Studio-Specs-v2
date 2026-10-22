import type { Block } from '../model/schema'
import { countWords, inlineHtmlToPlainText } from '../model/inline'
import type { ImportStats } from './types'

export function titleFromFileName(fileName: string | undefined, fallback: string): string {
  if (!fileName) return fallback
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return base || fallback
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export function buildImportStats(blocks: Block[], links: number): ImportStats {
  let words = 0
  let images = 0
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'callout':
      case 'quote':
        words += countWords(inlineHtmlToPlainText(block.html))
        break
      case 'list':
        words += block.items.reduce((total, item) => total + countWords(inlineHtmlToPlainText(item.html)), 0)
        break
      case 'table':
        words += block.rows.reduce(
          (total, row) =>
            total + row.reduce((rowTotal, cell) => rowTotal + countWords(inlineHtmlToPlainText(cell)), 0),
          0,
        )
        break
      case 'citation':
        words += countWords(block.quote || block.label || '')
        break
      case 'image':
        images += 1
        words += countWords(block.caption)
        break
      case 'video':
        words += countWords(block.title)
        break
      case 'divider':
        break
    }
  }
  return { blocks: blocks.length, words, images, links }
}

export interface DecodedDataUrl {
  blob: Blob
  mimeType: string
}

export function dataUrlToBlob(dataUrl: string): DecodedDataUrl | null {
  const match = /^data:([^;,]+)?((?:;[^,]*)*),(.*)$/s.exec(dataUrl.trim())
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const parameters = match[2] ?? ''
  const payload = match[3] ?? ''
  try {
    if (/;base64/i.test(parameters)) {
      const binary = atob(payload.replace(/\s+/g, ''))
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return { blob: new Blob([bytes], { type: mimeType }), mimeType }
    }
    return { blob: new Blob([decodeURIComponent(payload)], { type: mimeType }), mimeType }
  } catch {
    return null
  }
}

export function assetStatusLabel(status: string): string {
  switch (status) {
    case 'local':
      return 'Saved locally'
    case 'remote':
      return 'Remote URL'
    case 'unresolved':
      return 'Unresolved'
    case 'failed':
      return 'Retrieval failed'
    default:
      return status
  }
}
