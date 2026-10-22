// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { createBlock, createDocument } from '../src/model/factory'
import { PdfDocument } from '../src/export/pdf/PdfDocument'
import { validatePdfBytes } from '../src/export/pdf/exportPdf'
import type { ResolvedImage } from '../src/export/images'
import type { Document } from '../src/model/schema'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

function pngBytes(): Uint8Array {
  const binary = atob(PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function pdfDocument(): Document {
  const document = createDocument('PDF research', [
    { ...createBlock('heading'), id: 'h1', level: 1, html: 'PDF heading one' },
    {
      ...createBlock('paragraph'),
      id: 'p1',
      html: 'Readable paragraph with <strong>bold text</strong> and a <a href="https://example.com">link</a>.',
    },
    {
      ...createBlock('list'),
      id: 'l1',
      ordered: true,
      items: [
        { id: 'li1', html: 'First item', depth: 0 },
        { id: 'li2', html: 'Second item', depth: 1 },
      ],
    },
    {
      ...createBlock('table'),
      id: 't1',
      header: true,
      rows: [
        ['Name', 'Value'],
        ['Alpha', 'One'],
      ],
      caption: '',
    },
    {
      ...createBlock('image'),
      id: 'img1',
      alt: 'Tiny image',
      caption: 'Image caption',
      widthPercent: 50,
      status: 'local',
    },
    {
      ...createBlock('callout'),
      id: 'co1',
      title: 'Note',
      html: 'Callout body',
    },
    {
      ...createBlock('quote'),
      id: 'q1',
      html: 'Quoted line',
      attribution: 'Author',
    },
    {
      ...createBlock('citation'),
      id: 'c1',
      label: 'Source label',
      url: 'https://example.com',
      quote: 'Citation quote',
    },
  ])
  document.sources = [
    { id: 'src1', url: 'https://example.com', label: 'Example', kind: 'web' },
  ]
  document.exportSettings.includeSourceList = true
  return document
}

describe('PDF renderer', () => {
  it('renders a parseable paginated PDF with native text and an embedded image', async () => {
    const images = new Map<string, ResolvedImage>([
      [
        'img1',
        {
          blockId: 'img1',
          dataUrl: `data:image/png;base64,${PNG_BASE64}`,
          bytes: pngBytes(),
          mimeType: 'image/png',
          imageType: 'png',
          width: 1,
          height: 1,
        },
      ],
    ])

    const buffer = await renderToBuffer(
      <PdfDocument
        document={pdfDocument()}
        images={images}
        theme="classic"
      />,
    )
    const bytes = new Uint8Array(buffer)
    expect(bytes[0]).toBe(0x25)
    const validation = await validatePdfBytes(bytes)
    expect(validation.errors).toEqual([])
    expect(validation.ok).toBe(true)
    expect(validation.details).toMatch(/\d+ page/)
  })

  it('rejects bytes that are not a PDF', async () => {
    const validation = await validatePdfBytes(new TextEncoder().encode('not a pdf'))
    expect(validation.ok).toBe(false)
    expect(validation.errors.join(' ')).toMatch(/PDF header|too small/i)
  })
})
