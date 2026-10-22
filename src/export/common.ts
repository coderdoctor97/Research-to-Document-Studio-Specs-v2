import { parseInlineRuns, isSafeLinkHref, inlineHtmlToPlainText } from '../model/inline'
import type { Document } from '../model/schema'
import type { ExportWarning } from './images'

export function unsafeLinkWarnings(document: Document): ExportWarning[] {
  const warnings: ExportWarning[] = []
  const check = (url: string | undefined, context: string, blockId?: string) => {
    if (!url || !url.trim()) return
    if (isSafeLinkHref(url)) return
    warnings.push({
      code: 'unsafe-export-link',
      message: `${context} links to an address that isn't a web (http/https) or email link, so it appears as plain text — not clickable — in exports.`,
      blockId,
    })
  }

  for (const block of document.blocks) {
    if (block.type === 'citation') check(block.url, 'A citation', block.id)
    if (block.type === 'video') check(block.url, 'A video', block.id)
    if (block.type === 'quote') check(block.url, 'A quote source', block.id)
    if (block.type === 'image') check(block.url, 'An image', block.id)
    if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote' || block.type === 'callout') {
      for (const run of parseInlineRuns(block.html)) {
        if (run.href && !isSafeLinkHref(run.href)) {
          check(run.href, 'An inline link', block.id)
        }
      }
    }
  }
  for (const source of document.sources) check(source.url, `Source "${source.label || 'untitled'}"`)
  return warnings
}

export function textSamplesForValidation(document: Document): string[] {
  const samples: string[] = []
  for (const block of document.blocks) {
    let text = ''
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout' || block.type === 'quote') {
      text = inlineHtmlToPlainText(block.html)
    } else if (block.type === 'list') {
      text = block.items.map((item) => inlineHtmlToPlainText(item.html)).join(' ')
    } else if (block.type === 'table') {
      text = block.rows.flat().map((cell) => inlineHtmlToPlainText(cell)).join(' ')
    } else if (block.type === 'citation') {
      text = `${block.label} ${block.quote}`.trim()
    }
    const words = text.replace(/\s+/g, ' ').trim().split(' ')
    if (words.length >= 3 && text.trim().length >= 12) {
      samples.push(words.slice(0, 6).join(' '))
    }
    if (samples.length >= 2) break
  }
  return samples
}
