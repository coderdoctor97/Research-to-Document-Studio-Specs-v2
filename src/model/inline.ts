import DOMPurify from 'dompurify'

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

const ALLOWED_TAGS = ['a', 'strong', 'b', 'em', 'i', 'code', 'br', 'sup', 'sub']
const ALLOWED_ATTR = ['href', 'title']

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

export function htmlFromPlainText(text: string): string {
  return escapeHtml(text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
}

/** Only allow the inline subset this app can render and export. */
export function sanitizeInlineHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  })
  return clean.trim()
}

export function isSafeLinkHref(href: string | undefined): href is string {
  if (!href) return false
  return /^(https?:|mailto:)/i.test(href.trim())
}

interface StyleState {
  bold: boolean
  italic: boolean
  code: boolean
  href?: string
}

interface ParsedAttributes {
  [name: string]: string
}

function parseAttributes(raw: string): ParsedAttributes {
  const attrs: ParsedAttributes = {}
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match: RegExpExecArray | null
  while ((match = attrPattern.exec(raw))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '')
  }
  return attrs
}

function trimRuns(runs: InlineRun[]): InlineRun[] {
  const output = runs.map((run) => ({ ...run }))
  while (output.length > 0) {
    const first = output[0]
    first.text = first.text.replace(/^\s+/, '')
    if (first.text) break
    output.shift()
  }
  while (output.length > 0) {
    const last = output[output.length - 1]
    last.text = last.text.replace(/\s+$/, '')
    if (last.text) break
    output.pop()
  }
  return output
}

/**
 * Convert stored inline HTML into plain-text runs. This is the only path used
 * for display and export, so tags outside the allowlist are reduced to text.
 */
export function parseInlineRuns(html: string): InlineRun[] {
  const runs: InlineRun[] = []
  const style: StyleState = { bold: false, italic: false, code: false, href: undefined }
  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)\/?>/g

  const pushText = (raw: string) => {
    if (!raw) return
    const text = decodeEntities(raw).replace(/[\t\r\n ]+/g, ' ').replace(/\u00a0/g, ' ')
    if (!text) return
    runs.push({ ...style, text })
  }

  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(html))) {
    pushText(html.slice(cursor, match.index))
    cursor = match.index + match[0].length
    const tag = (match[1] ?? '').toLowerCase()
    if (!tag || match[0].startsWith('<!--')) continue
    const closing = match[0].startsWith('</')
    if (tag === 'br') {
      if (!closing) runs.push({ ...style, text: '\n' })
      continue
    }
    if (tag === 'a') {
      if (closing) {
        style.href = undefined
      } else {
        const href = parseAttributes(match[2] ?? '').href
        style.href = isSafeLinkHref(href) ? href.trim() : undefined
      }
      continue
    }
    if (tag === 'strong' || tag === 'b') {
      style.bold = !closing
      continue
    }
    if (tag === 'em' || tag === 'i') {
      style.italic = !closing
      continue
    }
    if (tag === 'code') {
      style.code = !closing
      continue
    }
  }
  pushText(html.slice(cursor))
  return trimRuns(runs)
}

export function inlineHtmlToPlainText(html: string): string {
  return parseInlineRuns(html)
    .map((run) => run.text)
    .join('')
}

export function inlineHtmlIsEmpty(html: string): boolean {
  if (sanitizeInlineHtml(html).trim() === '') return true
  return inlineHtmlToPlainText(html).trim() === ''
}

export function extractLinksFromHtml(html: string): Array<{ href: string; label: string }> {
  const links = new Map<string, string>()
  for (const run of parseInlineRuns(html)) {
    if (!run.href) continue
    const key = run.href.trim()
    const label = run.text.trim()
    if (!links.has(key)) {
      links.set(key, label)
    } else if (label && !links.get(key)) {
      links.set(key, label)
    }
  }
  return [...links.entries()].map(([href, label]) => ({ href, label: label || href }))
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

export function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
