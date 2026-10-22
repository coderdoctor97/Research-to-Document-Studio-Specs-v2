import { pdf } from '@react-pdf/renderer'
import { PDFDocument as PdfLibDocument } from 'pdf-lib'
import type { Document } from '../../model/schema'
import { PdfDocument } from './PdfDocument'
import type { ExportValidation, ExportResult } from '../types'
import { slugifyFileName } from '../types'
import type { ExportWarning, ResolvedImage } from '../images'
import { unsafeLinkWarnings } from '../common'
import { blobToBytes } from '../../lib/binary'

export async function validatePdfBytes(bytes: Uint8Array): Promise<ExportValidation> {
  const errors: string[] = []
  const warnings: string[] = []
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  if (header !== '%PDF-') {
    errors.push('The generated file does not start with a PDF header.')
  }
  if (bytes.byteLength < 800) {
    errors.push('The generated PDF is too small to contain a document page.')
  }
  let pageCount = 0
  try {
    const parsed = await PdfLibDocument.load(bytes, { updateMetadata: false })
    pageCount = parsed.getPageCount()
    if (pageCount < 1) {
      errors.push('The generated PDF has no pages.')
    }
    for (let index = 0; index < pageCount; index += 1) {
      const page = parsed.getPage(index)
      const { width, height } = page.getSize()
      if (width < 200 || height < 200) {
        errors.push(`PDF page ${index + 1} has an invalid size.`)
      }
    }
  } catch (error) {
    errors.push(
      `The generated PDF could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    details: `${pageCount} page${pageCount === 1 ? '' : 's'}, ${Math.round(bytes.byteLength / 1024)} KB, checked and readable as a PDF.`,
  }
}

export async function exportPdf(
  document: Document,
  images: Map<string, ResolvedImage>,
  imageWarnings: ExportWarning[] = [],
): Promise<ExportResult> {
  const warnings = [...unsafeLinkWarnings(document), ...imageWarnings]

  for (const block of document.blocks) {
    if (block.type !== 'image') continue
    const resolved = images.get(block.id)
    if (resolved && resolved.imageType !== 'png' && resolved.imageType !== 'jpg') {
      warnings.push({
        code: 'pdf-image-format',
        message: `${resolved.imageType.toUpperCase()} images can't go into a PDF, so a placeholder is shown instead. Convert the image to PNG or JPEG to include it.`,
        blockId: block.id,
      })
    }
  }

  let blob: Blob
  try {
    blob = await pdf(
      <PdfDocument document={document} images={images} theme={document.exportSettings.theme} />,
    ).toBlob()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fontHint = /WinAnsi|encode|font/i.test(message)
      ? ' The built-in PDF fonts cover Latin text only — remove unsupported characters (such as emoji or non-Latin script), or export DOCX instead.'
      : ''
    throw new Error(`Couldn't build the PDF: ${message.replace(/\.$/, '')}.${fontHint}`)
  }

  const bytes = await blobToBytes(blob)
  const validation = await validatePdfBytes(bytes)
  if (document.blocks.length === 0) {
    validation.errors.push('The document has no content blocks.')
    validation.ok = false
  }
  if (imageWarnings.length > 0) {
    const warningCount = new Set(imageWarnings.map((warning) => warning.message)).size
    validation.warnings.push(
      `${warningCount} image warning${warningCount === 1 ? '' : 's'} — a placeholder was used wherever an image couldn't be included. Fix those image blocks to embed the real pictures.`,
    )
  }

  return {
    blob,
    fileName: slugifyFileName(document.title, 'pdf'),
    validation,
  }
}
