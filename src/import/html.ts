import type { Asset, Block, ImageBlock, ListItem, Source, VideoBlock } from '../model/schema'
import { newId } from '../model/ids'
import {
  escapeHtml,
  extractLinksFromHtml,
  htmlFromPlainText,
  inlineHtmlToPlainText,
  isSafeLinkHref,
  sanitizeInlineHtml,
  sourceHostname,
} from '../model/inline'
import type {
  ImportFormat,
  ImportOriginal,
  ImportPreview,
  ImportWarning,
  ImportOptions,
} from './types'
import { ImportError } from './types'
import { buildImportStats, dataUrlToBlob, isHttpUrl, titleFromFileName } from './shared'

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'map',
  'area',
  'meta',
  'link',
  'base',
  'track',
  'param',
])
const BLOCK_WRAPPERS = new Set([
  'html',
  'body',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'center',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'address',
  'fieldset',
  'form',
  'label',
])
const INLINE_TAGS = new Set(['a', 'strong', 'b', 'em', 'i', 'code', 'br', 'sup', 'sub'])

interface HtmlContext {
  format: ImportFormat
  blocks: Block[]
  assets: Map<string, Asset>
  assetBlobs: Record<string, Blob>
  sources: Map<string, Source>
  warnings: ImportWarning[]
  warningKeys: Set<string>
  assetKeys: Map<string, string>
  warnedTags: Set<string>
  firstHeading: string
}

export interface HtmlImportRequest extends ImportOptions {
  html: string
  format?: ImportFormat
  original: ImportOriginal
  titleFallback?: string
}

function warn(
  context: HtmlContext,
  code: string,
  message: string,
  severity: ImportWarning['severity'] = 'warning',
): void {
  const key = `${code}|${message}`
  if (context.warningKeys.has(key)) return
  context.warningKeys.add(key)
  context.warnings.push({ code, message, severity })
}

function blockMetadata(context: HtmlContext, originalTag: string, extra?: Record<string, unknown>) {
  return {
    origin: 'import' as const,
    importFormat: context.format,
    originalTag,
    ...extra,
  }
}

function ensureSource(context: HtmlContext, url: string, label: string): Source {
  const existing = context.sources.get(url)
  if (existing) {
    if (!existing.label && label) existing.label = label
    return existing
  }
  const source: Source = {
    id: newId('src'),
    url,
    label: label.trim() || sourceHostname(url),
    kind: 'web',
    accessedAt: new Date().toISOString(),
  }
  context.sources.set(url, source)
  return source
}

interface InlineResult {
  html: string
  sourceRefs: string[]
}

function registerInlineHtml(rawHtml: string, context: HtmlContext): InlineResult {
  if (/\shref\s*=\s*["']?\s*(?:javascript|vbscript|data):/i.test(rawHtml)) {
    warn(context, 'unsafe-link', 'Removed an unsafe link URL from imported content.')
  }
  const hrefPattern = /<a\b[^>]*\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let hrefMatch: RegExpExecArray | null
  while ((hrefMatch = hrefPattern.exec(rawHtml))) {
    const href = (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '').trim()
    if (!href || href.startsWith('#') || isSafeLinkHref(href)) continue
    if (/^(javascript|vbscript|data):/i.test(href)) continue
    warn(
      context,
      'relative-link',
      'A relative link was kept as text because no base URL was available to resolve it.',
      'info',
    )
  }

  const html = sanitizeInlineHtml(rawHtml)
  const sourceRefs: string[] = []
  for (const link of extractLinksFromHtml(html)) {
    const source = ensureSource(context, link.href, link.label)
    if (!sourceRefs.includes(source.id)) sourceRefs.push(source.id)
  }

  const tagPattern = /<\s*([a-zA-Z][a-zA-Z0-9]*)\b/g
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagPattern.exec(rawHtml))) {
    const tag = tagMatch[1].toLowerCase()
    if (INLINE_TAGS.has(tag) || tag === 'span' || tag === 'font') continue
    if (tag === 'img' || tag === 'br') continue
    warn(
      context,
      'inline-formatting',
      'Some inline formatting was reduced to plain text during import.',
      'info',
    )
    break
  }

  return { html, sourceRefs }
}

function mergeSourceRefs(target: string[], next: string[]): void {
  for (const id of next) {
    if (!target.includes(id)) target.push(id)
  }
}

function assetFromRemoteImage(context: HtmlContext, src: string): Asset {
  const existingId = context.assetKeys.get(src)
  if (existingId) return context.assets.get(existingId) as Asset
  const asset: Asset = {
    id: newId('asset'),
    kind: 'image',
    originalUrl: src,
    alt: '',
    caption: '',
    attribution: '',
    status: 'remote',
  }
  context.assets.set(asset.id, asset)
  context.assetKeys.set(src, asset.id)
  return asset
}

function makeImageBlock(
  image: Element,
  context: HtmlContext,
  options: { caption?: string; attribution?: string; warnContext?: string } = {},
): ImageBlock | null {
  const src =
    image.getAttribute('src')?.trim() ||
    image.getAttribute('data-src')?.trim() ||
    image.getAttribute('data-original')?.trim() ||
    ''
  const alt = image.getAttribute('alt')?.trim() ?? ''
  const title = image.getAttribute('title')?.trim() ?? ''
  const caption = options.caption?.trim() || title
  const attribution = options.attribution?.trim() || ''
  const width = Number.parseInt(image.getAttribute('width') ?? '', 10)
  const height = Number.parseInt(image.getAttribute('height') ?? '', 10)

  if (!src) {
    warn(
      context,
      'image-without-source',
      'An image without a source URL was kept as an empty image placeholder.',
    )
    return {
      id: newId('blk'),
      type: 'image',
      sourceRefs: [],
      metadata: blockMetadata(context, 'img'),
      alt,
      caption,
      attribution,
      align: 'center',
      widthPercent: 100,
      status: 'unresolved',
    }
  }

  let asset: Asset
  if (src.startsWith('data:')) {
    const decoded = dataUrlToBlob(src)
    if (!decoded) {
      warn(context, 'image-data-invalid', 'A data-URL image could not be decoded.')
      asset = {
        id: newId('asset'),
        kind: 'image',
        alt,
        caption,
        attribution,
        status: 'unresolved',
      }
    } else {
      const cacheKey = `data:${decoded.mimeType}:${src.length}:${src.slice(-64)}`
      const existingId = context.assetKeys.get(cacheKey)
      if (existingId) {
        asset = context.assets.get(existingId) as Asset
      } else {
        asset = {
          id: newId('asset'),
          kind: 'image',
          storageKey: '',
          mimeType: decoded.mimeType,
          width: Number.isFinite(width) ? width : undefined,
          height: Number.isFinite(height) ? height : undefined,
          alt,
          caption,
          attribution,
          status: 'local',
        }
        asset.storageKey = asset.id
        context.assets.set(asset.id, asset)
        context.assetBlobs[asset.id] = decoded.blob
        context.assetKeys.set(cacheKey, asset.id)
      }
    }
  } else if (isHttpUrl(src)) {
    asset = assetFromRemoteImage(context, src)
    if (width) asset.width = width
    if (height) asset.height = height
  } else {
    warn(
      context,
      'image-relative-url',
      `An image with a relative or unsupported URL was kept as unresolved: ${src.slice(0, 120)}`,
    )
    asset = {
      id: newId('asset'),
      kind: 'image',
      originalUrl: src,
      alt,
      caption,
      attribution,
      status: 'unresolved',
    }
  }

  return {
    id: newId('blk'),
    type: 'image',
    sourceRefs: [],
    metadata: blockMetadata(context, 'img'),
    assetId: asset.id,
    url: asset.status === 'local' ? undefined : src,
    alt,
    caption,
    attribution,
    align: 'center',
    widthPercent: 100,
    status: asset.status,
  }
}

function detectProvider(url: string): VideoBlock['provider'] {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/vimeo\.com/i.test(url)) return 'vimeo'
  return 'other'
}

function makeVideoBlock(
  url: string,
  context: HtmlContext,
  options: { title?: string; caption?: string } = {},
): VideoBlock {
  return {
    id: newId('blk'),
    type: 'video',
    sourceRefs: [],
    metadata: blockMetadata(context, 'video'),
    url,
    title: options.title?.trim() || (detectProvider(url) === 'youtube' ? 'YouTube video' : 'Video'),
    caption: options.caption?.trim() ?? '',
    provider: detectProvider(url),
  }
}

function appendLinkParagraph(url: string, context: HtmlContext, label: string, tag: string): void {
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
  const inline = registerInlineHtml(html, context)
  context.blocks.push({
    id: newId('blk'),
    type: 'paragraph',
    sourceRefs: inline.sourceRefs,
    metadata: blockMetadata(context, tag),
    html: inline.html,
  })
}

function extractMediaFromClone(
  clone: Element,
  context: HtmlContext,
  target: Block[],
  options: { caption?: string; warnMessage?: string } = {},
): void {
  const media = clone.querySelectorAll('img, iframe, video')
  if (media.length > 0 && options.warnMessage) {
    warn(context, 'media-moved', options.warnMessage, 'info')
  }
  media.forEach((element) => {
    if (element.tagName.toLowerCase() === 'img') {
      const image = makeImageBlock(element, context, { caption: options.caption })
      if (image) target.push(image)
    } else {
      const source =
        element.getAttribute('src')?.trim() ||
        element.querySelector('source')?.getAttribute('src')?.trim() ||
        ''
      if (isHttpUrl(source)) {
        target.push(makeVideoBlock(source, context, { title: element.getAttribute('title') ?? undefined }))
      }
    }
    element.remove()
  })
}

function parseInlineContainer(
  element: Element,
  context: HtmlContext,
): { result: InlineResult; extras: Block[] } {
  const clone = element.cloneNode(true) as Element
  const extras: Block[] = []
  extractMediaFromClone(clone, context, extras)
  const result = registerInlineHtml(clone.innerHTML, context)
  return { result, extras }
}

function handleHeading(element: Element, context: HtmlContext): void {
  const tag = element.tagName.toLowerCase()
  const level = Number.parseInt(tag.slice(1), 10)
  const { result, extras } = parseInlineContainer(element, context)
  if (result.html && !isVisuallyEmpty(result.html)) {
    const text = inlineHtmlToPlainText(result.html)
    if (tag === 'h1' && !context.firstHeading) context.firstHeading = text
    context.blocks.push({
      id: newId('blk'),
      type: 'heading',
      sourceRefs: result.sourceRefs,
      metadata: blockMetadata(context, tag),
      level: Math.min(6, Math.max(1, level)),
      html: result.html,
    })
  }
  context.blocks.push(...extras)
}

function isVisuallyEmpty(html: string): boolean {
  return inlineHtmlToPlainText(html).trim() === '' && !/<br/i.test(html)
}

function handleParagraph(element: Element, context: HtmlContext): void {
  const { result, extras } = parseInlineContainer(element, context)
  if (!isVisuallyEmpty(result.html)) {
    context.blocks.push({
      id: newId('blk'),
      type: 'paragraph',
      sourceRefs: result.sourceRefs,
      metadata: blockMetadata(context, 'p'),
      html: result.html,
    })
  }
  context.blocks.push(...extras)
}

function handleInlineElement(element: Element, context: HtmlContext): void {
  const clone = element.cloneNode(true) as Element
  const extras: Block[] = []
  extractMediaFromClone(clone, context, extras)
  const result = registerInlineHtml(clone.outerHTML, context)
  if (isVisuallyEmpty(result.html)) return
  context.blocks.push({
    id: newId('blk'),
    type: 'paragraph',
    sourceRefs: result.sourceRefs,
    metadata: blockMetadata(context, element.tagName.toLowerCase()),
    html: result.html,
  })
  context.blocks.push(...extras)
}

interface ListResult {
  block: Block | null
  extras: Block[]
}

function parseList(element: Element, context: HtmlContext): ListResult {
  const items: ListItem[] = []
  const extras: Block[] = []
  const sourceRefs: string[] = []
  const topOrdered = element.tagName.toLowerCase() === 'ol'
  let mixedKinds = false

  const visit = (list: Element, depth: number) => {
    const ordered = list.tagName.toLowerCase() === 'ol'
    if (depth > 0 && ordered !== topOrdered) mixedKinds = true
    for (const child of Array.from(list.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue
      const clone = child.cloneNode(true) as Element
      const nestedLists = Array.from(clone.querySelectorAll(':scope > ul, :scope > ol'))

      if (clone.querySelector('table')) {
        warn(
          context,
          'table-in-list',
          'A table nested in a list item was flattened. Move it into its own block to keep the table structure.',
        )
      }
      if (clone.querySelector('img')) {
        warn(
          context,
          'image-in-list',
          'Images inside list items were moved below the list as separate image blocks.',
          'info',
        )
      }
      extractMediaFromClone(clone, context, extras)
      nestedLists.forEach((nested) => nested.remove())

      const inline = registerInlineHtml(clone.innerHTML, context)
      mergeSourceRefs(sourceRefs, inline.sourceRefs)
      if (!isVisuallyEmpty(inline.html)) {
        items.push({ id: newId('li'), html: inline.html, depth })
      }
      for (const nested of nestedLists) {
        const tag = nested.tagName.toLowerCase()
        if (tag === 'ul' || tag === 'ol') visit(nested, depth + 1)
      }
    }
  }

  visit(element, 0)
  if (mixedKinds) {
    warn(
      context,
      'nested-list-style',
      'Nested numbered/bulleted list style was normalized to the top-level list style.',
      'info',
    )
  }
  if (items.length === 0) {
    return { block: null, extras }
  }
  return {
    block: {
      id: newId('blk'),
      type: 'list',
      sourceRefs,
      metadata: blockMetadata(context, element.tagName.toLowerCase()),
      ordered: topOrdered,
      items,
    },
    extras,
  }
}

function parseTable(element: Element, context: HtmlContext): Block | null {
  const rows = Array.from((element as HTMLTableElement).rows ?? [])
  if (rows.length === 0) {
    warn(context, 'empty-table', 'An empty table was skipped.')
    return null
  }

  const hasThead = Boolean((element as HTMLTableElement).tHead)
  const firstRow = rows[0]
  const header =
    hasThead ||
    (firstRow !== undefined &&
      firstRow.cells.length > 0 &&
      Array.from(firstRow.cells).every((cell) => cell.tagName.toLowerCase() === 'th'))

  const sourceRefs: string[] = []
  const cellRows: string[][] = []
  let sawSpan = false
  let sawNestedTable = false
  let sawImage = false

  for (const row of rows) {
    const cells: string[] = []
    for (const cell of Array.from(row.cells)) {
      if (cell.colSpan > 1 || cell.rowSpan > 1) sawSpan = true
      if (cell.querySelector('table')) sawNestedTable = true
      const clone = cell.cloneNode(true) as Element
      clone.querySelectorAll('table').forEach((nested) => nested.remove())
      if (clone.querySelector('img')) sawImage = true
      clone.querySelectorAll('img, iframe, video').forEach((media) => media.remove())
      const inline = registerInlineHtml(clone.innerHTML, context)
      mergeSourceRefs(sourceRefs, inline.sourceRefs)
      cells.push(inline.html)
    }
    cellRows.push(cells)
  }

  if (sawSpan) {
    warn(
      context,
      'table-spans',
      'Merged table cells were flattened; row and column spans are not preserved.',
    )
  }
  if (sawNestedTable) {
    warn(
      context,
      'nested-table',
      'A nested table was flattened into its cell text. Move it to its own block to keep the structure.',
    )
  }
  if (sawImage) {
    warn(
      context,
      'image-in-table',
      'Images inside table cells were removed from the table. Add them as image blocks if needed.',
      'info',
    )
  }

  const captionElement = element.querySelector(':scope > caption')
  return {
    id: newId('blk'),
    type: 'table',
    sourceRefs,
    metadata: blockMetadata(context, 'table'),
    header,
    rows: cellRows,
    caption: captionElement?.textContent?.trim() ?? '',
  }
}

function parseBlockquote(element: Element, context: HtmlContext): void {
  const clone = element.cloneNode(true) as Element
  const extras: Block[] = []
  extractMediaFromClone(clone, context, extras, {
    warnMessage: 'Images inside a quote were moved below the quote as image blocks.',
  })

  const citation = clone.querySelector('cite')
  let attribution = citation?.textContent?.trim() ?? ''
  let url = ''
  if (citation) {
    const link = citation.querySelector('a[href]')
    const href = link?.getAttribute('href') ?? ''
    if (isSafeLinkHref(href)) url = href
    citation.remove()
  }
  if (!attribution) {
    const lastParagraph = Array.from(clone.querySelectorAll('p')).at(-1)
    const text = lastParagraph?.textContent?.trim() ?? ''
    const match = /^(?:\u2014|\u2013|--?)\s*(.+)$/.exec(text)
    if (match) {
      attribution = match[1].trim()
      lastParagraph?.remove()
    }
  }

  let html = ''
  const sourceRefs: string[] = []
  const paragraphs = Array.from(clone.querySelectorAll(':scope > p'))
  if (paragraphs.length > 0) {
    const parts: string[] = []
    for (const paragraph of paragraphs) {
      const inline = registerInlineHtml(paragraph.innerHTML, context)
      if (inline.html) parts.push(inline.html)
      mergeSourceRefs(sourceRefs, inline.sourceRefs)
    }
    html = parts.join('<br><br>')
  } else {
    const inline = registerInlineHtml(clone.innerHTML, context)
    html = inline.html
    mergeSourceRefs(sourceRefs, inline.sourceRefs)
  }

  if (!isVisuallyEmpty(html)) {
    context.blocks.push({
      id: newId('blk'),
      type: 'quote',
      sourceRefs,
      metadata: blockMetadata(context, 'blockquote'),
      html,
      attribution,
      url,
    })
  }
  context.blocks.push(...extras)
}

function handleCodeBlock(element: Element, context: HtmlContext): void {
  const text = element.textContent ?? ''
  if (!text.trim()) return
  const html = `<code>${escapeHtml(text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')}</code>`
  const languageClass = Array.from(element.classList).find((name) => name.startsWith('language-'))
  context.blocks.push({
    id: newId('blk'),
    type: 'paragraph',
    sourceRefs: [],
    metadata: blockMetadata(context, 'pre', {
      format: 'code',
      language: languageClass?.slice('language-'.length) ?? '',
    }),
    html,
  })
}

function handleFigure(element: Element, context: HtmlContext): void {
  const images = Array.from(element.querySelectorAll('img'))
  const caption = element.querySelector(':scope > figcaption')?.textContent?.trim() ?? ''
  if (images.length === 0) {
    walkChildren(element, context)
    return
  }
  for (const image of images) {
    const block = makeImageBlock(image, context, { caption })
    if (block) context.blocks.push(block)
  }
  for (const child of Array.from(element.children)) {
    const tag = child.tagName.toLowerCase()
    if (tag === 'figcaption' || tag === 'img') continue
    if (child.querySelector('img')) continue
    walkNode(child, context)
  }
}

function handleIframe(element: Element, context: HtmlContext): void {
  const src = element.getAttribute('src')?.trim() ?? ''
  if (!src) {
    warn(context, 'iframe-empty', 'An embedded frame without a URL was skipped.')
    return
  }
  if (!isHttpUrl(src)) {
    warn(context, 'iframe-unsafe', 'An embedded frame with an unsupported URL was skipped.')
    return
  }
  const provider = detectProvider(src)
  if (provider === 'youtube' || provider === 'vimeo') {
    const title = element.getAttribute('title')?.trim() ?? ''
    context.blocks.push(makeVideoBlock(src, context, { title }))
    warn(
      context,
      'video-as-link',
      'Video embeds are preserved as links. Video files are not downloaded or embedded in exports.',
      'info',
    )
    return
  }
  warn(
    context,
    'iframe-as-link',
    'An embedded frame was replaced by a link so that no external page runs inside the document.',
  )
  appendLinkParagraph(src, context, element.getAttribute('title')?.trim() || src, 'iframe')
}

function handleVideo(element: Element, context: HtmlContext): void {
  const src =
    element.getAttribute('src')?.trim() ||
    element.querySelector('source')?.getAttribute('src')?.trim() ||
    ''
  if (!src) {
    warn(context, 'video-empty', 'A video element without a source was skipped.')
    return
  }
  if (!isHttpUrl(src)) {
    warn(context, 'video-url', 'A video with an unsupported source URL was skipped.')
    return
  }
  const title = element.getAttribute('title')?.trim() ?? ''
  context.blocks.push(makeVideoBlock(src, context, { title }))
  warn(
    context,
    'video-as-link',
    'Video elements are preserved as links. Video files are not downloaded or embedded in exports.',
    'info',
  )
}

function handleUnknown(element: Element, context: HtmlContext): void {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) {
    handleHeading(element, context)
    return
  }
  const { result, extras } = parseInlineContainer(element, context)
  if (result.html && !isVisuallyEmpty(result.html)) {
    context.blocks.push({
      id: newId('blk'),
      type: 'paragraph',
      sourceRefs: result.sourceRefs,
      metadata: blockMetadata(context, tag),
      html: result.html,
    })
  }
  context.blocks.push(...extras)
  if (!context.warnedTags.has(tag)) {
    context.warnedTags.add(tag)
    warn(
      context,
      'unknown-element',
      `Unsupported HTML element <${tag}> was flattened to readable content.`,
      'info',
    )
  }
}

function walkNode(node: Node, context: HtmlContext): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text) return
    context.blocks.push({
      id: newId('blk'),
      type: 'paragraph',
      sourceRefs: [],
      metadata: blockMetadata(context, '#text'),
      html: sanitizeInlineHtml(htmlFromPlainText(text)),
    })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  const tag = element.tagName.toLowerCase()

  if (SKIP_TAGS.has(tag)) {
    const url =
      tag === 'object' || tag === 'embed'
        ? element.getAttribute('data')?.trim() || element.getAttribute('src')?.trim() || ''
        : ''
    if (url && isHttpUrl(url)) {
      appendLinkParagraph(url, context, `Embedded content (${tag})`, tag)
      warn(
        context,
        'embed-as-link',
        'Embedded content was replaced by a link. Never executed during import.',
      )
    } else {
      warn(context, `skipped-${tag}`, `Element <${tag}> was removed during import.`, tag === 'script' ? 'warning' : 'info')
    }
    return
  }

  switch (tag) {
    case 'p':
      handleParagraph(element, context)
      return
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      handleHeading(element, context)
      return
    case 'ul':
    case 'ol': {
      const list = parseList(element, context)
      if (list.block) context.blocks.push(list.block)
      context.blocks.push(...list.extras)
      return
    }
    case 'table': {
      const table = parseTable(element, context)
      if (table) context.blocks.push(table)
      return
    }
    case 'blockquote':
      parseBlockquote(element, context)
      return
    case 'pre':
      handleCodeBlock(element, context)
      return
    case 'hr':
      context.blocks.push({
        id: newId('blk'),
        type: 'divider',
        sourceRefs: [],
        metadata: blockMetadata(context, 'hr'),
      })
      return
    case 'img': {
      const image = makeImageBlock(element, context)
      if (image) context.blocks.push(image)
      return
    }
    case 'figure':
      handleFigure(element, context)
      return
    case 'figcaption': {
      const inline = registerInlineHtml(element.innerHTML, context)
      if (!isVisuallyEmpty(inline.html)) {
        context.blocks.push({
          id: newId('blk'),
          type: 'paragraph',
          sourceRefs: inline.sourceRefs,
          metadata: blockMetadata(context, 'figcaption'),
          html: inline.html,
        })
      }
      return
    }
    case 'iframe':
      handleIframe(element, context)
      return
    case 'video':
      handleVideo(element, context)
      return
    case 'audio': {
      const src = element.getAttribute('src')?.trim() ?? ''
      if (urlSafe(src)) {
        appendLinkParagraph(src, context, element.getAttribute('title')?.trim() || 'Audio file', 'audio')
      } else {
        warn(context, 'audio-skip', 'An audio element without a safe URL was skipped.')
      }
      return
    }
    case 'a':
      handleInlineElement(element, context)
      return
    case 'br':
    case 'source':
    case 'tbody':
    case 'thead':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
    case 'li':
      return
  }

  if (BLOCK_WRAPPERS.has(tag)) {
    if (tag === 'form') {
      warn(
        context,
        'form-flattened',
        'Form controls were removed; the form text was kept as document content.',
        'info',
      )
    }
    walkChildren(element, context)
    return
  }

  if (INLINE_TAGS.has(tag)) {
    handleInlineElement(element, context)
    return
  }

  const hasBlockChildren = element.querySelector('p, div, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, pre, figure')
  if (hasBlockChildren) {
    walkChildren(element, context)
    return
  }
  handleUnknown(element, context)
}

function walkChildren(parent: ParentNode, context: HtmlContext): void {
  for (const child of Array.from(parent.childNodes)) {
    walkNode(child, context)
  }
}

function urlSafe(url: string): boolean {
  return isHttpUrl(url)
}

function looksLikeFullHtml(text: string): boolean {
  return /<(?:!doctype|html|head|body)\b/i.test(text)
}

export function importHtml(request: HtmlImportRequest): ImportPreview {
  const format = request.format ?? 'html'
  const context: HtmlContext = {
    format,
    blocks: [],
    assets: new Map(),
    assetBlobs: {},
    sources: new Map(),
    warnings: [],
    warningKeys: new Set(),
    assetKeys: new Map(),
    warnedTags: new Set(),
    firstHeading: '',
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(
    looksLikeFullHtml(request.html) ? request.html : `<html><body>${request.html}</body></html>`,
    'text/html',
  )

  if (document.querySelector('script')) {
    warn(
      context,
      'scripts-removed',
      'Imported scripts were removed and never executed.',
    )
  }
  if (/\son[a-z]+\s*=/i.test(request.html)) {
    warn(
      context,
      'inline-handlers',
      'Inline event handler attributes were removed from imported content.',
    )
  }
  if (document.querySelector('base[href]')) {
    warn(
      context,
      'base-url-ignored',
      'A document base URL was ignored; relative links and images remain unresolved.',
      'info',
    )
  }

  walkChildren(document.body ?? document.documentElement, context)

  if (context.blocks.length === 0) {
    throw new ImportError(
      'No readable content was found in this HTML. It may contain only scripts, styles, or unsupported media.',
    )
  }

  const fallbackTitle = request.titleFallback ?? titleFromFileName(request.fileName, 'Imported document')
  const htmlTitle = document.title.trim()
  const title = context.firstHeading || htmlTitle || fallbackTitle

  return {
    format,
    title,
    blocks: context.blocks,
    assets: [...context.assets.values()],
    assetBlobs: context.assetBlobs,
    sources: [...context.sources.values()],
    warnings: context.warnings,
    stats: buildImportStats(context.blocks, context.sources.size),
    original: request.original,
  }
}
