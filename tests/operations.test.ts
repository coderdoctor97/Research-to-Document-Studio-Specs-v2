import { describe, expect, it } from 'vitest'
import { createBlock, createDocument } from '../src/model/factory'
import {
  deleteBlock,
  documentStats,
  duplicateBlock,
  insertBlock,
  moveBlock,
  moveBlockBy,
  outlineFromDocument,
  updateBlock,
} from '../src/editor/operations'

function documentWithParagraphs() {
  const first = { ...createBlock('paragraph'), id: 'blk_a', html: 'First' }
  const second = { ...createBlock('paragraph'), id: 'blk_b', html: 'Second' }
  const third = { ...createBlock('paragraph'), id: 'blk_c', html: 'Third' }
  return createDocument('Ops', [first, second, third])
}

describe('block operations', () => {
  it('moves blocks by id without mutating the source document', () => {
    const document = documentWithParagraphs()
    const moved = moveBlock(document, 'blk_c', 0)
    expect(moved.blocks.map((block) => block.id)).toEqual(['blk_c', 'blk_a', 'blk_b'])
    expect(document.blocks.map((block) => block.id)).toEqual(['blk_a', 'blk_b', 'blk_c'])
    expect(moveBlockBy(moved, 'blk_c', 1).blocks.map((block) => block.id)).toEqual([
      'blk_a',
      'blk_c',
      'blk_b',
    ])
  })

  it('duplicates a block with a new block id and new list item ids', () => {
    const list = {
      ...createBlock('list'),
      id: 'blk_list',
      items: [{ id: 'li_one', html: 'Item', depth: 0 }],
    }
    const document = createDocument('Duplicate', [list])
    const duplicated = duplicateBlock(document, 'blk_list')
    expect(duplicated.blocks).toHaveLength(2)
    expect(duplicated.blocks[1].id).not.toBe('blk_list')
    const copy = duplicated.blocks[1]
    expect(copy.type).toBe('list')
    if (copy.type === 'list') {
      expect(copy.items[0].id).not.toBe('li_one')
      expect(copy.items[0].html).toBe('Item')
    }
  })

  it('updates, inserts and deletes blocks atomically', () => {
    const document = documentWithParagraphs()
    const updated = updateBlock(document, 'blk_a', (block) =>
      block.type === 'paragraph' ? { ...block, html: 'Changed' } : block,
    )
    expect(updated.blocks[0]).toMatchObject({ html: 'Changed' })
    expect(document.blocks[0]).toMatchObject({ html: 'First' })

    const inserted = insertBlock(updated, { ...createBlock('divider'), id: 'blk_new' }, 1)
    expect(inserted.blocks.map((block) => block.id)).toEqual([
      'blk_a',
      'blk_new',
      'blk_b',
      'blk_c',
    ])
    expect(deleteBlock(inserted, 'blk_b').blocks.map((block) => block.id)).toEqual([
      'blk_a',
      'blk_new',
      'blk_c',
    ])
  })

  it('derives a heading outline and statistics', () => {
    const document = createDocument('Stats', [
      { ...createBlock('heading'), id: 'h1', level: 1, html: 'Title' },
      { ...createBlock('paragraph'), id: 'p1', html: 'Three words here' },
      { ...createBlock('heading'), id: 'h2', level: 2, html: 'Section' },
      { ...createBlock('divider'), id: 'd1' },
    ])
    expect(outlineFromDocument(document).map((heading) => heading.id)).toEqual(['h1', 'h2'])
    expect(documentStats(document)).toMatchObject({
      blocks: 4,
      words: 5,
      headings: 2,
    })
  })
})
