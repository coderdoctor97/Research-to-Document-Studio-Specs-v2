import { describe, expect, it } from 'vitest'
import {
  Document as DocxDocument,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { importDocx } from '../src/import/docx'
import { importPdf } from '../src/import/pdf'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

function pngBytes(): Uint8Array {
  const binary = atob(PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function fileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  } as unknown as File
}

async function docxFile(): Promise<File> {
  const document = new DocxDocument({
    sections: [
      {
        children: [
          new Paragraph({ text: 'DOCX report', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Plain paragraph with '),
              new TextRun({ text: 'bold text', bold: true }),
              new TextRun(' and a '),
              new TextRun({ text: 'link', style: 'Hyperlink' }),
              new TextRun('.'),
            ],
          }),
          new Paragraph({ text: 'First bullet', bullet: { level: 0 } }),
          new Paragraph({ text: 'Second bullet', bullet: { level: 0 } }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Name')] }),
                  new TableCell({ children: [new Paragraph('Value')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Alpha')] }),
                  new TableCell({ children: [new Paragraph('One')] }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: pngBytes(),
                transformation: { width: 16, height: 16 },
                altText: { name: 'pixel', description: 'One pixel sample', title: 'Pixel' },
              }),
            ],
          }),
        ],
      },
    ],
  })
  const bytes = new Uint8Array(await Packer.toBuffer(document))
  return fileFromBytes(
    bytes,
    'research-notes.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
}

async function pdfFile(): Promise<File> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  page.drawText('PDF Report', { x: 60, y: 760, size: 24, font })
  page.drawText('This is the first paragraph of the PDF.', { x: 60, y: 720, size: 12, font })
  page.drawText('It continues on a second line.', { x: 60, y: 704, size: 12, font })
  page.drawText('A separate paragraph sits lower.', { x: 60, y: 640, size: 12, font })
  const bytes = await pdf.save()
  return fileFromBytes(bytes, 'source-paper.pdf', 'application/pdf')
}

describe('DOCX import', () => {
  it('converts headings, paragraphs, lists, tables and images into blocks', async () => {
    const preview = await importDocx(await docxFile())

    expect(preview.format).toBe('docx')
    expect(preview.title).toBe('DOCX report')
    expect(preview.original).toMatchObject({ kind: 'file', fileName: 'research-notes.docx' })
    expect(preview.warnings[0].code).toBe('docx-fidelity')

    const types = preview.blocks.map((block) => block.type)
    expect(types).toContain('heading')
    expect(types).toContain('paragraph')
    expect(types).toContain('list')
    expect(types).toContain('table')

    const heading = preview.blocks.find((block) => block.type === 'heading')
    expect(heading).toMatchObject({ type: 'heading', level: 1, html: 'DOCX report' })

    const paragraph = preview.blocks.find(
      (block): block is Extract<typeof block, { type: 'paragraph' }> =>
        block.type === 'paragraph' && block.html.includes('Plain paragraph'),
    )
    expect(paragraph?.html).toContain('<strong>bold text</strong>')

    const list = preview.blocks.find((block) => block.type === 'list')
    expect(list?.type).toBe('list')
    if (list?.type === 'list') {
      expect(list.items.map((item) => item.html)).toEqual(['First bullet', 'Second bullet'])
    }

    const table = preview.blocks.find((block) => block.type === 'table')
    expect(table?.type).toBe('table')
    if (table?.type === 'table') {
      expect(table.rows[0]).toEqual(['Name', 'Value'])
      expect(table.rows[1]).toEqual(['Alpha', 'One'])
    }

    const image = preview.blocks.find((block) => block.type === 'image')
    expect(image?.type).toBe('image')
    if (image?.type === 'image') {
      expect(image.status).toBe('local')
      expect(image.alt).toBe('One pixel sample')
      expect(image.assetId).toBeTruthy()
      expect(preview.assetBlobs[image.assetId as string]).toBeInstanceOf(Blob)
      expect(preview.assetBlobs[image.assetId as string].size).toBeGreaterThan(0)
    }
    expect(preview.stats.images).toBe(1)
  })

  it('reports a damaged DOCX file clearly', async () => {
    const bytes = new TextEncoder().encode('not a zip file')
    await expect(
      importDocx(fileFromBytes(bytes, 'broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    ).rejects.toThrow(/could not be read/i)
  })
})

describe('PDF import', () => {
  it('extracts paragraphs and reports layout limits', async () => {
    const preview = await importPdf(await pdfFile())

    expect(preview.format).toBe('pdf')
    expect(preview.title).toBe('source paper')
    expect(preview.original).toMatchObject({ kind: 'file', fileName: 'source-paper.pdf' })
    expect(preview.blocks.length).toBeGreaterThan(0)
    expect(preview.blocks.every((block) => block.type === 'paragraph' || block.type === 'heading')).toBe(
      true,
    )
    expect(
      preview.blocks.some(
        (block) => (block.type === 'paragraph' || block.type === 'heading') && block.html.includes('first paragraph'),
      ),
    ).toBe(true)
    expect(preview.warnings.some((warning) => warning.code === 'pdf-images')).toBe(true)
    expect(preview.warnings.some((warning) => warning.code === 'pdf-layout')).toBe(true)
    expect(preview.stats.blocks).toBe(preview.blocks.length)
  })

  it('rejects a file that is not a PDF', async () => {
    const bytes = new TextEncoder().encode('plain text, not a PDF')
    await expect(importPdf(fileFromBytes(bytes, 'broken.pdf', 'application/pdf'))).rejects.toThrow(
      /could not be opened/i,
    )
  })
})
