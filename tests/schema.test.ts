import { describe, expect, it } from 'vitest'
import { createBlock, createDocument } from '../src/model/factory'
import { parseDocument, safeParseDocument } from '../src/model/migrations'
import { documentSchema } from '../src/model/schema'

describe('document schema', () => {
  it('accepts a document created by the factory', () => {
    const document = createDocument('Test title', [
      createBlock('heading'),
      createBlock('paragraph'),
      createBlock('list'),
      createBlock('table'),
      createBlock('image'),
      createBlock('video'),
      createBlock('citation'),
      createBlock('callout'),
      createBlock('quote'),
      createBlock('divider'),
    ])
    const parsed = parseDocument(document)
    expect(parsed.title).toBe('Test title')
    expect(parsed.blocks).toHaveLength(10)
    expect(parsed.schemaVersion).toBe(1)
  })

  it('rejects unknown block types instead of dropping them', () => {
    const document = createDocument('Test')
    const invalid = {
      ...document,
      blocks: [{ ...createBlock('paragraph'), type: 'video-embed' }],
    }
    expect(documentSchema.safeParse(invalid).success).toBe(false)
  })

  it('migrates a version 0 document and preserves text', () => {
    const legacy = {
      version: 0,
      id: 'doc_legacy',
      title: 'Legacy',
      blocks: [
        { type: 'heading', level: 1, text: 'Old heading' },
        { type: 'paragraph', text: 'A paragraph with <angle> brackets & ampersands.' },
        { type: 'list', items: ['First', 'Second'] },
        { type: 'mystery', text: 'Keep this text' },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }
    const result = safeParseDocument(legacy)
    expect(result.success).toBe(true)
    expect(result.document?.schemaVersion).toBe(1)
    expect(result.document?.blocks[0]).toMatchObject({ type: 'heading', level: 1, html: 'Old heading' })
    expect(result.document?.blocks[1]).toMatchObject({ type: 'paragraph' })
    if (result.document?.blocks[1].type === 'paragraph') {
      expect(result.document.blocks[1].html).toContain('&lt;angle&gt;')
      expect(result.document.blocks[1].html).toContain('&amp;')
    }
    expect(result.document?.blocks[3]).toMatchObject({
      type: 'paragraph',
      html: 'Keep this text',
      metadata: { migratedFromType: 'mystery' },
    })
  })

  it('rejects a document from a newer schema version', () => {
    const document = { ...createDocument('Future'), schemaVersion: 99 }
    expect(() => parseDocument(document)).toThrow(/newer|supports version/i)
  })
})
