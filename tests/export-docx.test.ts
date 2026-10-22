import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createBlock, createDocument } from '../src/model/factory'
import type { Document } from '../src/model/schema'
import { exportDocx } from '../src/export/docx/exportDocx'
import { resolveDocumentImages } from '../src/export/images'
import { blobToBytes } from '../src/lib/binary'
import { saveAssetBlob } from '../src/storage/repository'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

function pngBytes(): Uint8Array<ArrayBuffer> {
  const binary = atob(PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function richDocument(): Document {
  const document = createDocument('Export research', [
    { ...createBlock('heading'), id: 'h1', level: 1, html: 'Export heading' },
    {
      ...createBlock('paragraph'),
      id: 'p1',
      html: 'Intro with <a href="https://example.com/source">a source link</a>.',
    },
    {
      ...createBlock('list'),
      id: 'l1',
      ordered: true,
      items: [
        { id: 'li1', html: 'First item', depth: 0 },
        { id: 'li2', html: 'Nested item', depth: 1 },
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
      caption: 'Table caption',
    },
    {
      ...createBlock('image'),
      id: 'img1',
      assetId: 'asset_export',
      alt: 'Tiny image',
      caption: 'Image caption',
      widthPercent: 50,
      status: 'local',
    },
    {
      ...createBlock('citation'),
      id: 'c1',
      label: 'Example source',
      url: 'https://example.com/source',
      quote: 'A quoted line',
    },
    {
      ...createBlock('quote'),
      id: 'q1',
      html: 'Quoted export text',
      attribution: 'Researcher',
    },
    {
      ...createBlock('callout'),
      id: 'co1',
      title: 'Remember',
      html: 'Callout body text',
    },
    {
      ...createBlock('paragraph'),
      id: 'code1',
      html: '<code>const answer = 42</code>',
      metadata: { format: 'code' },
    },
    { ...createBlock('divider'), id: 'd1' },
    {
      ...createBlock('video'),
      id: 'v1',
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'A video',
    },
  ])
  document.sources = [
    {
      id: 'src1',
      url: 'https://example.com/source',
      label: 'Example',
      kind: 'web',
    },
  ]
  document.assets = [
    {
      id: 'asset_export',
      kind: 'image',
      storageKey: 'asset_export',
      mimeType: 'image/png',
      status: 'local',
      alt: 'Tiny image',
      caption: '',
      attribution: '',
    },
  ]
  return document
}

describe('DOCX export', () => {
  it('writes native Word structures and validates text, headings, lists, tables, links and images', async () => {
    const document = richDocument()
    const bytes = pngBytes()
    const images = new Map([
      [
        'img1',
        {
          blockId: 'img1',
          dataUrl: `data:image/png;base64,${PNG_BASE64}`,
          bytes,
          mimeType: 'image/png',
          imageType: 'png' as const,
          width: 1,
          height: 1,
        },
      ],
    ])

    const result = await exportDocx(document, images)
    expect(result.validation.errors).toEqual([])
    expect(result.validation.ok).toBe(true)
    expect(result.fileName).toBe('Export research.docx')
    expect(result.blob.size).toBeGreaterThan(1000)

    const zip = await JSZip.loadAsync(await blobToBytes(result.blob))
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')
    expect(documentXml).toBeTruthy()
    expect(documentXml).toContain('<w:tbl')
    expect(documentXml).toContain('<w:numPr')
    expect(documentXml).toContain('w:pStyle w:val="Heading1"')
    expect(documentXml).toContain('<w:drawing')
    expect(documentXml).toContain('<w:hyperlink')
    expect(relsXml).toContain('https://example.com/source')
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true)
    expect(result.validation.details).toMatch(/embedded image/)
  })

  it('fails validation for an empty document', async () => {
    const result = await exportDocx(createDocument('Empty'), new Map())
    expect(result.validation.ok).toBe(false)
    expect(result.validation.errors.join(' ')).toMatch(/no content blocks/i)
  })

  it('reports missing exported images through resolution warnings', async () => {
    const document = createDocument('Missing image', [
      {
        ...createBlock('image'),
        id: 'missing-image',
        alt: 'Missing',
        status: 'unresolved',
      },
    ])
    const resolved = await resolveDocumentImages(document)
    expect(resolved.byBlockId.size).toBe(0)
    expect(resolved.warnings.some((warning) => warning.code === 'image-source-missing')).toBe(true)
  })

  it('resolves a stored asset blob for exports', async () => {
    const bytes = pngBytes()
    await saveAssetBlob('asset_export', new Blob([bytes], { type: 'image/png' }), 'image/png')
    const document = richDocument()
    const resolved = await resolveDocumentImages(document)
    const image = resolved.byBlockId.get('img1')
    expect(image?.imageType).toBe('png')
    expect(image?.width).toBe(1)
    expect(image?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })
})
