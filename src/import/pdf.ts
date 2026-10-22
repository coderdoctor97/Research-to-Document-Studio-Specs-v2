// The legacy build carries polyfills for older browsers and Node-based tests.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { Block, Source } from '../model/schema'
import { newId } from '../model/ids'
import { escapeHtml, sourceHostname } from '../model/inline'
import type { ImportPreview, ImportWarning } from './types'
import { ImportError } from './types'
import { buildImportStats, titleFromFileName } from './shared'

if (typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
}

interface PdfTextItem {
  str: string
  dir: string
  fontName: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

interface PdfLine {
  page: number
  text: string
  y: number
  height: number
}

interface PdfPageText {
  page: number
  lines: PdfLine[]
  links: string[]
  hasText: boolean
}

function warn(warnings: ImportWarning[], code: string, message: string, severity: ImportWarning['severity'] = 'warning') {
  if (warnings.some((entry) => entry.code === code && entry.message === message)) return
  warnings.push({ code, message, severity })
}

function groupPageLines(items: PdfTextItem[], pageNumber: number): PdfLine[] {
  const sorted = items
    .filter((item) => item.str !== undefined && item.str !== '')
    .slice()
    .sort((a, b) => {
      const yDifference = b.transform[5] - a.transform[5]
      if (Math.abs(yDifference) > 2) return yDifference
      return a.transform[4] - b.transform[4]
    })

  const lineBuckets: Array<{ y: number; height: number; items: PdfTextItem[] }> = []
  for (const item of sorted) {
    const y = item.transform[5]
    const height = item.height || Math.abs(item.transform[3]) || 10
    const bucket = lineBuckets.find((candidate) => Math.abs(candidate.y - y) <= Math.max(2, height * 0.3))
    if (bucket) {
      bucket.items.push(item)
      bucket.height = Math.max(bucket.height, height)
      bucket.y = (bucket.y * (bucket.items.length - 1) + y) / bucket.items.length
    } else {
      lineBuckets.push({ y, height, items: [item] })
    }
  }

  return lineBuckets
    .map((bucket) => {
      const ordered = bucket.items.slice().sort((a, b) => a.transform[4] - b.transform[4])
      let text = ''
      let previousEnd = Number.NEGATIVE_INFINITY
      for (const item of ordered) {
        const x = item.transform[4]
        const needsSpace =
          text.length > 0 &&
          x - previousEnd > Math.max(1, (item.height || 10) * 0.12) &&
          !text.endsWith(' ') &&
          !item.str.startsWith(' ')
        text += `${needsSpace ? ' ' : ''}${item.str}`
        previousEnd = x + (item.width || 0)
      }
      return {
        page: pageNumber,
        text: text.replace(/\s+/g, ' ').trim(),
        y: bucket.y,
        height: bucket.height,
      }
    })
    .filter((line) => line.text.length > 0)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function buildBlocks(
  pages: PdfPageText[],
  linksByPage: Map<number, Source[]>,
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = []
  const allLines = pages.flatMap((page) => page.lines)
  const bodyHeight = median(allLines.map((line) => line.height)) || 12
  const headingHeights = allLines
    .filter((line) => line.text.length <= 120)
    .map((line) => line.height)
    .filter((height) => height >= bodyHeight * 1.25)
  const headingThreshold = headingHeights.length > 0 ? Math.min(...headingHeights) : bodyHeight * 1.25

  let paragraphLines: PdfLine[] = []
  let paragraphPage = 0
  let lastLine: PdfLine | null = null
  let usedHeadingHeuristic = false

  const pageSources = (page: number): string[] =>
    (linksByPage.get(page) ?? []).map((source) => source.id)

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    const html = paragraphLines
      .map((line) => escapeHtml(line.text))
      .join(' ')
      .trim()
    paragraphLines = []
    if (!html) return
    blocks.push({
      id: newId('blk'),
      type: 'paragraph',
      sourceRefs: pageSources(paragraphPage),
      metadata: {
        origin: 'import',
        importFormat: 'pdf',
        originalTag: 'pdf-text',
        page: paragraphPage,
      },
      html,
    })
  }

  for (const page of pages) {
    for (const line of page.lines) {
      const isHeading =
        line.text.length <= 120 &&
        line.height >= headingThreshold &&
        line.height >= bodyHeight * 1.25
      if (isHeading) {
        flushParagraph()
        usedHeadingHeuristic = true
        const level = line.height >= bodyHeight * 1.7 ? 1 : 2
        blocks.push({
          id: newId('blk'),
          type: 'heading',
          sourceRefs: pageSources(page.page),
          metadata: {
            origin: 'import',
            importFormat: 'pdf',
            originalTag: 'pdf-text',
            page: page.page,
            inferredHeading: true,
          },
          level,
          html: escapeHtml(line.text),
        })
        lastLine = null
        continue
      }

      const startsNewParagraph =
        paragraphLines.length === 0 ||
        paragraphPage !== page.page ||
        (lastLine !== null && lastLine.y - line.y > Math.max(lastLine.height, line.height) * 1.7)

      if (startsNewParagraph) {
        flushParagraph()
        paragraphPage = page.page
      }
      paragraphLines.push(line)
      lastLine = line
    }
    flushParagraph()
    lastLine = null
  }

  if (usedHeadingHeuristic) {
    warn(
      warnings,
      'pdf-headings',
      'Headings in this PDF were inferred from text size and may need correction.',
      'info',
    )
  }
  return blocks
}

export async function importPdf(file: File): Promise<ImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const warnings: ImportWarning[] = []
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null
  let pdf: pdfjs.PDFDocumentProxy
  try {
    loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      stopAtErrors: false,
    })
    pdf = await loadingTask.promise
  } catch (error) {
    throw new ImportError(
      `The PDF file could not be opened. ${error instanceof Error ? error.message : 'The file may be damaged or encrypted.'}`,
    )
  }

  try {
    const pages: PdfPageText[] = []
    const linksByPage = new Map<number, Source[]>()

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const items = textContent.items.filter(
        (item): item is PdfTextItem => 'str' in item,
      )
      const lines = groupPageLines(items, pageNumber)

      const pageLinks: Source[] = []
      try {
        const annotations = await page.getAnnotations()
        for (const annotation of annotations) {
          const url = typeof annotation.url === 'string' ? annotation.url : ''
          if (!/^https?:\/\//i.test(url)) continue
          if (pageLinks.some((source) => source.url === url)) continue
          pageLinks.push({
            id: newId('src'),
            url,
            label: sourceHostname(url),
            kind: 'web',
            accessedAt: new Date().toISOString(),
          })
        }
      } catch {
        warn(
          warnings,
          'pdf-links',
          `Links on PDF page ${pageNumber} could not be read.`,
          'info',
        )
      }
      if (pageLinks.length > 0) linksByPage.set(pageNumber, pageLinks)

      pages.push({
        page: pageNumber,
        lines,
        links: pageLinks.map((source) => source.url ?? ''),
        hasText: lines.length > 0,
      })
      page.cleanup()
    }

    const textPageCount = pages.filter((page) => page.hasText).length
    if (textPageCount === 0) {
      throw new ImportError(
        'This PDF contains no extractable text. It is probably scanned; OCR is not supported in this MVP.',
      )
    }
    if (textPageCount < pages.length) {
      const missing = pages.filter((page) => !page.hasText).map((page) => page.page)
      warn(
        warnings,
        'pdf-empty-pages',
        `No text was extracted from PDF page${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. They may be scanned images.`,
      )
    }

    warn(
      warnings,
      'pdf-images',
      'Images and vector graphics in the PDF are not imported. Re-add important figures as image blocks.',
    )
    warn(
      warnings,
      'pdf-layout',
      'PDF import infers paragraphs from text position. Multi-column layouts may be merged; verify the reading order.',
      'info',
    )

    const blocks = buildBlocks(pages, linksByPage, warnings)
    if (blocks.length === 0) {
      throw new ImportError('No readable text blocks could be built from this PDF.')
    }

    const metadata = await pdf.getMetadata().catch(() => null)
    const info = metadata?.info as { Title?: unknown } | undefined
    const metadataTitle = typeof info?.Title === 'string' ? info.Title.trim() : ''
    const sourceList = [...linksByPage.values()].flat()

    return {
      format: 'pdf',
      title: metadataTitle || titleFromFileName(file.name, 'Imported PDF'),
      blocks,
      assets: [],
      assetBlobs: {},
      sources: sourceList,
      warnings,
      stats: buildImportStats(blocks, sourceList.length),
      original: {
        kind: 'file',
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        blob: file,
      },
    }
  } finally {
    if (loadingTask) await loadingTask.destroy()
  }
}
