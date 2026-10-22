import { beforeEach, describe, expect, it } from 'vitest'
import { importHtml } from '../src/import/html'
import type { ImportPreview } from '../src/import/types'
import { blobToBytes } from '../src/lib/binary'
import { createBlock, createDocument } from '../src/model/factory'
import type { Document } from '../src/model/schema'
import {
  clearAllLocalData,
  getAssetBlob,
  getImportOriginal,
} from '../src/storage/repository'
import { appendImport, documentFromImport } from '../src/studio/importCommit'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blobToBytes(blob))
}

function htmlPreview(): ImportPreview {
  return importHtml({
    html: [
      '<h1>Imported report</h1>',
      '<p>Body text with a <a href="https://example.com/source">link</a>.</p>',
      `<p><img src="data:image/png;base64,${PNG_BASE64}" alt="Pixel"></p>`,
    ].join(''),
    format: 'html',
    fileName: 'report.html',
    original: {
      kind: 'file',
      fileName: 'report.html',
      mimeType: 'text/html',
      blob: new Blob(['<h1>Imported report</h1>'], { type: 'text/html' }),
    },
  })
}

function pastePreview(): ImportPreview {
  return {
    format: 'paste',
    title: 'Appended',
    blocks: [
      {
        ...createBlock('paragraph'),
        id: 'blk_appended_text',
        sourceRefs: ['src_shared', 'src_new'],
        html: 'Appended text',
      },
      {
        ...createBlock('citation'),
        id: 'blk_appended_cite',
        sourceRefs: ['src_new'],
        sourceId: 'src_new',
        label: 'New source',
        url: 'https://example.com/new',
        quote: 'Quoted',
      },
    ],
    assets: [],
    assetBlobs: {},
    sources: [
      {
        id: 'src_shared',
        url: 'https://example.com/shared',
        label: 'Shared source',
        kind: 'web',
      },
      {
        id: 'src_new',
        url: 'https://example.com/new',
        label: 'New source',
        kind: 'web',
      },
    ],
    warnings: [{ code: 'test-warning', message: 'Keep this warning', severity: 'info' }],
    stats: { blocks: 2, words: 4, images: 0, links: 2 },
    original: { kind: 'paste', text: 'Appended text\n\nQuoted' },
  }
}

describe('import commit', () => {
  beforeEach(async () => {
    await clearAllLocalData()
  })

  it('builds a document from a preview and stores its assets and original', async () => {
    const preview = htmlPreview()
    expect(preview.assets).toHaveLength(1)
    expect(preview.assetBlobs[preview.assets[0].id]).toBeInstanceOf(Blob)

    const document = await documentFromImport(preview)

    expect(document.title).toBe('Imported report')
    expect(document.blocks).toHaveLength(preview.blocks.length)
    expect(document.sources).toHaveLength(1)
    expect(document.sources[0].url).toBe('https://example.com/source')
    expect(document.assets).toHaveLength(1)
    expect(document.assets[0].status).toBe('local')
    expect(document.assets[0].storageKey).toBe(document.assets[0].id)
    expect(document.imports).toHaveLength(1)
    expect(document.imports[0]).toMatchObject({
      format: 'html',
      fileName: 'report.html',
      originalAvailable: true,
    })
    expect(document.imports[0].blobKey).toBe(document.imports[0].id)

    const storedAsset = await getAssetBlob(document.assets[0].storageKey as string)
    expect(storedAsset).toBeInstanceOf(Blob)
    expect(storedAsset?.size).toBeGreaterThan(0)

    const original = await getImportOriginal(document.imports[0].blobKey as string)
    expect(await textOf(original?.blob as Blob)).toContain('Imported report')
    expect(original?.fileName).toBe('report.html')
  })

  it('keeps pasted originals and warnings in the import record', async () => {
    const document = await documentFromImport(pastePreview())
    expect(document.imports[0]).toMatchObject({ format: 'paste', originalAvailable: true })
    expect(document.imports[0].warnings).toEqual(['Keep this warning'])
    expect(document.imports[0].rawText).toBe('Appended text\n\nQuoted')

    const original = await getImportOriginal(document.imports[0].blobKey as string)
    expect(await textOf(original?.blob as Blob)).toBe('Appended text\n\nQuoted')
  })

  it('reuses sources with the same URL and remaps provenance when appending', async () => {
    const base: Document = createDocument('Existing', [
      { ...createBlock('paragraph'), html: 'Existing text' },
    ])
    base.sources = [
      {
        id: 'src_existing',
        url: 'https://example.com/shared',
        label: 'Shared source',
        kind: 'web',
      },
    ]

    const preview = pastePreview()
    const merged = await appendImport(base, preview)

    expect(merged.blocks).toHaveLength(3)
    expect(merged.blocks[0]).toBe(base.blocks[0])
    expect(merged.sources).toHaveLength(2)
    expect(merged.sources[0]).toBe(base.sources[0])
    expect(merged.sources[1]).toMatchObject({ id: 'src_new', url: 'https://example.com/new' })

    const textBlock = merged.blocks[1]
    expect(textBlock.id).toBe('blk_appended_text')
    expect(textBlock.sourceRefs).toEqual(['src_existing', 'src_new'])

    const citation = merged.blocks[2]
    expect(citation.type).toBe('citation')
    if (citation.type === 'citation') {
      expect(citation.sourceId).toBe('src_new')
      expect(citation.sourceRefs).toEqual(['src_new'])
    }

    expect(merged.imports).toHaveLength(1)
    expect(merged.imports[0].blobKey).toBe(merged.imports[0].id)
    expect(await getImportOriginal(merged.imports[0].blobKey as string)).not.toBeNull()
  })

  it('does not mutate the document passed to appendImport', async () => {
    const base = createDocument('Existing', [])
    const merged = await appendImport(base, pastePreview())

    expect(base.blocks).toHaveLength(0)
    expect(base.sources).toHaveLength(0)
    expect(base.imports).toHaveLength(0)
    expect(merged.imports).toHaveLength(1)
  })
})
