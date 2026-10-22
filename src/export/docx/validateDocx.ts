import JSZip from 'jszip'
import type { Document } from '../../model/schema'
import { isSafeLinkHref, parseInlineRuns } from '../../model/inline'
import type { ResolvedImage } from '../images'
import { isImageTypeSupportedByDocx } from '../images'
import type { ExportValidation } from '../types'
import { textSamplesForValidation } from '../common'
import { blobToBytes } from '../../lib/binary'

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractParagraphTexts(documentXml: string): string[] {
  const paragraphs: string[] = []
  const paragraphPattern = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g
  let paragraphMatch: RegExpExecArray | null
  while ((paragraphMatch = paragraphPattern.exec(documentXml))) {
    const body = paragraphMatch[1]
    const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let text = ''
    let textMatch: RegExpExecArray | null
    while ((textMatch = textPattern.exec(body))) {
      text += decodeXml(textMatch[1])
    }
    if (text.trim()) paragraphs.push(text)
  }
  return paragraphs
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}

function normalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim()
    .toLowerCase()
}

function hasSafeDocumentLink(document: Document): boolean {
  if (document.sources.some((source) => source.url && isSafeLinkHref(source.url))) return true
  for (const block of document.blocks) {
    if (block.type === 'citation' || block.type === 'video' || block.type === 'quote') {
      if (block.url && isSafeLinkHref(block.url)) return true
    }
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout' || block.type === 'quote') {
      if (parseInlineRuns(block.html).some((run) => run.href && isSafeLinkHref(run.href))) return true
    }
    if (block.type === 'list') {
      if (
        block.items.some((item) =>
          parseInlineRuns(item.html).some((run) => run.href && isSafeLinkHref(run.href)),
        )
      )
        return true
    }
    if (block.type === 'table') {
      if (
        block.rows.some((row) =>
          row.some((cell) =>
            parseInlineRuns(cell).some((run) => run.href && isSafeLinkHref(run.href)),
          ),
        )
      )
        return true
    }
  }
  return false
}

export async function validateDocxBlob(
  blob: Blob,
  document: Document,
  images: Map<string, ResolvedImage>,
): Promise<ExportValidation> {
  const errors: string[] = []
  const warnings: string[] = []
  let details = 'Unreadable DOCX package.'

  if (document.blocks.length === 0) {
    errors.push('The document has no content blocks.')
  }
  if (blob.size < 1000) {
    errors.push('The generated DOCX is too small to contain a document.')
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await blobToBytes(blob))
  } catch (error) {
    return {
      ok: false,
      errors: [`The generated DOCX package could not be read: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
      details,
    }
  }

  const documentEntry = zip.file('word/document.xml')
  const contentTypes = zip.file('[Content_Types].xml')
  const stylesEntry = zip.file('word/styles.xml')
  if (!documentEntry) errors.push('The DOCX package is missing word/document.xml.')
  if (!contentTypes) errors.push('The DOCX package is missing [Content_Types].xml.')
  if (!stylesEntry) warnings.push('The DOCX package has no styles.xml; default Word styles will apply.')
  if (!documentEntry) {
    return { ok: false, errors, warnings, details }
  }

  const documentXml = await documentEntry.async('string')
  const relsEntry = zip.file('word/_rels/document.xml.rels')
  const relsXml = relsEntry ? await relsEntry.async('string') : ''
  const paragraphs = extractParagraphTexts(documentXml)
  const visibleText = normalize(paragraphs.join('\n'))

  if (visibleText.length === 0) {
    errors.push('The DOCX contains no visible text.')
  }

  const samples = textSamplesForValidation(document)
  for (const sample of samples) {
    if (!visibleText.includes(normalize(sample))) {
      errors.push(`Imported text is missing from the DOCX: "${sample.slice(0, 80)}".`)
    }
  }

  const headingBlocks = document.blocks.filter((block) => block.type === 'heading').length
  const headingStyles = countMatches(documentXml, /w:pStyle[^>]*w:val="Heading[1-6]"/g)
  if (headingBlocks > 0 && headingStyles === 0) {
    errors.push('Heading blocks were exported without native Word heading styles.')
  }

  const listBlocks = document.blocks.filter((block) => block.type === 'list' && block.items.length > 0).length
  const listMarkers = countMatches(documentXml, /<w:numPr>/g)
  if (listBlocks > 0 && listMarkers === 0) {
    errors.push('List blocks were exported without native Word list numbering.')
  }

  const tableBlocks =
    document.blocks.filter((block) => block.type === 'table').length +
    document.blocks.filter((block) => block.type === 'callout').length
  const tableCount = countMatches(documentXml, /<w:tbl(?:\s[^>]*)?>/g)
  if (tableBlocks > 0 && tableCount === 0) {
    errors.push('Table or callout blocks were exported without native Word tables.')
  } else if (tableCount < tableBlocks) {
    errors.push('Some table or callout blocks are missing from the DOCX.')
  }

  const expectedImages = document.blocks.filter(
    (block) => block.type === 'image' && images.get(block.id) && isImageTypeSupportedByDocx(images.get(block.id)!.imageType),
  ).length
  const drawingCount = countMatches(documentXml, /<w:drawing(?:\s[^>]*)?>/g)
  if (expectedImages > 0 && drawingCount < expectedImages) {
    errors.push(
      `The DOCX contains ${drawingCount} embedded image${drawingCount === 1 ? '' : 's'} but ${expectedImages} were expected.`,
    )
  }

  const linkExpected = hasSafeDocumentLink(document)
  const hyperlinkCount = countMatches(documentXml, /<w:hyperlink(?:\s[^>]*)?>/g)
  const externalRelationships = countMatches(relsXml, /TargetMode="External"/g)
  if (linkExpected && hyperlinkCount === 0 && externalRelationships === 0) {
    errors.push('Hyperlinks were expected but the DOCX contains no external link relationships.')
  }

  if (expectedImages > 0) {
    warnings.push(`${expectedImages} image${expectedImages === 1 ? '' : 's'} embedded as native Word drawings.`)
  }

  details = `${paragraphs.length} paragraph${paragraphs.length === 1 ? '' : 's'}, ${tableCount} table${tableCount === 1 ? '' : 's'}, ${drawingCount} embedded image${drawingCount === 1 ? '' : 's'}, ${hyperlinkCount} hyperlink${hyperlinkCount === 1 ? '' : 's'}, ${Math.round(blob.size / 1024)} KB.`

  return { ok: errors.length === 0, errors, warnings, details }
}
