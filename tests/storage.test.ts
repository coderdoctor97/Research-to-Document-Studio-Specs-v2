import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { createBlock, createDocument } from '../src/model/factory'
import {
  clearAllLocalData,
  deleteProject,
  duplicateProject,
  getAssetBlob,
  getImportOriginal,
  listProjects,
  loadDocument,
  saveAssetBlob,
  saveDocument,
  saveImportOriginal,
} from '../src/storage/repository'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

function pngBlob(): Blob {
  const binary = atob(PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new NodeBlob([bytes], { type: 'image/png' }) as unknown as Blob
}

const originalBlob = globalThis.Blob
beforeAll(() => {
  // fake-indexeddb cannot structured-clone jsdom's Blob; Node's Blob round-trips correctly.
  globalThis.Blob = NodeBlob as unknown as typeof Blob
})
afterAll(() => {
  globalThis.Blob = originalBlob
})

describe('local persistence', () => {
  beforeEach(async () => {
    await clearAllLocalData()
  })

  it('saves, lists and reopens a project', async () => {
    const document = createDocument('Persisted', [
      { ...createBlock('heading'), html: 'Saved heading' },
      { ...createBlock('paragraph'), html: 'Saved paragraph' },
    ])
    await saveDocument(document)

    const summaries = await listProjects()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ id: document.id, title: 'Persisted', blockCount: 2 })

    const loaded = await loadDocument(document.id)
    expect(loaded.title).toBe('Persisted')
    expect(loaded.blocks).toHaveLength(2)
    expect(loaded.blocks[0]).toMatchObject({ type: 'heading', html: 'Saved heading' })
  })

  it('stores asset blobs and original imports by id', async () => {
    const document = createDocument('Assets')
    await saveDocument(document)
    const assetId = 'asset_test'
    await saveAssetBlob(assetId, pngBlob(), 'image/png')
    const stored = await getAssetBlob(assetId)
    expect(stored).toBeInstanceOf(Blob)
    expect(stored?.size).toBeGreaterThan(0)

    await saveImportOriginal('import_test', {
      kind: 'paste',
      text: 'Original pasted content',
    })
    const original = await getImportOriginal('import_test')
    expect(await original?.blob.text()).toBe('Original pasted content')
  })

  it('duplicates a project with a new document id', async () => {
    const document = createDocument('Original', [{ ...createBlock('paragraph'), html: 'Copy me' }])
    await saveDocument(document)
    const copy = await duplicateProject(document.id)
    expect(copy.id).not.toBe(document.id)
    expect(copy.title).toBe('Original copy')
    expect(copy.blocks).toHaveLength(1)

    const summaries = await listProjects()
    expect(summaries).toHaveLength(2)
  })

  it('deletes a project and reports a missing project clearly', async () => {
    const document = createDocument('Delete me')
    await saveDocument(document)
    await deleteProject(document.id)
    await expect(loadDocument(document.id)).rejects.toThrow(/no longer exists/i)
  })

  it('refuses to save an invalid document', async () => {
    const document = { ...createDocument('Broken'), title: 42 }
    await expect(saveDocument(document as never)).rejects.toThrow(/not saved/i)
  })
})
