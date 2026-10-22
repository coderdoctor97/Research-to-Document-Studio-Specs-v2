import type { Block, BlockType, Document, HeadingBlock } from '../model/schema'
import { newId } from '../model/ids'
import { inlineHtmlToPlainText, countWords } from '../model/inline'

export function updateBlock(
  document: Document,
  blockId: string,
  updater: (block: Block) => Block,
): Document {
  let changed = false
  const blocks = document.blocks.map((block) => {
    if (block.id !== blockId) return block
    changed = true
    return updater(block)
  })
  return changed ? { ...document, blocks } : document
}

export function insertBlock(document: Document, block: Block, index?: number): Document {
  const target = index === undefined ? document.blocks.length : Math.max(0, Math.min(index, document.blocks.length))
  const blocks = [...document.blocks]
  blocks.splice(target, 0, block)
  return { ...document, blocks }
}

export function deleteBlock(document: Document, blockId: string): Document {
  return { ...document, blocks: document.blocks.filter((block) => block.id !== blockId) }
}

export function moveBlock(document: Document, blockId: string, targetIndex: number): Document {
  const from = document.blocks.findIndex((block) => block.id === blockId)
  if (from === -1) return document
  const to = Math.max(0, Math.min(targetIndex, document.blocks.length - 1))
  if (from === to) return document
  const blocks = [...document.blocks]
  const [block] = blocks.splice(from, 1)
  blocks.splice(to, 0, block)
  return { ...document, blocks }
}

export function moveBlockBy(document: Document, blockId: string, delta: number): Document {
  const from = document.blocks.findIndex((block) => block.id === blockId)
  if (from === -1) return document
  return moveBlock(document, blockId, from + delta)
}

function cloneBlockWithNewIds(block: Block): Block {
  const copy = structuredClone(block)
  copy.id = newId('blk')
  if (copy.type === 'list') {
    copy.items = copy.items.map((item) => ({ ...item, id: newId('li') }))
  }
  return copy
}

export function duplicateBlock(document: Document, blockId: string): Document {
  const index = document.blocks.findIndex((block) => block.id === blockId)
  if (index === -1) return document
  const copy = cloneBlockWithNewIds(document.blocks[index])
  return insertBlock(document, copy, index + 1)
}

export function replaceBlocks(document: Document, blocks: Block[]): Document {
  return { ...document, blocks }
}

export function outlineFromDocument(document: Document): HeadingBlock[] {
  return document.blocks.filter((block): block is HeadingBlock => block.type === 'heading')
}

export interface DocumentStats {
  blocks: number
  words: number
  headings: number
  images: number
  videos: number
  citations: number
  sources: number
}

export function documentStats(document: Document): DocumentStats {
  let words = 0
  let headings = 0
  let images = 0
  let videos = 0
  let citations = 0

  for (const block of document.blocks) {
    switch (block.type) {
      case 'heading':
        headings += 1
        words += countWords(inlineHtmlToPlainText(block.html))
        break
      case 'paragraph':
      case 'callout':
      case 'quote':
        words += countWords(inlineHtmlToPlainText(block.html))
        break
      case 'list':
        words += block.items.reduce((total, item) => total + countWords(inlineHtmlToPlainText(item.html)), 0)
        break
      case 'table':
        words += block.rows.reduce(
          (total, row) =>
            total + row.reduce((rowTotal, cell) => rowTotal + countWords(inlineHtmlToPlainText(cell)), 0),
          0,
        )
        break
      case 'image':
        images += 1
        words += countWords(block.caption)
        break
      case 'video':
        videos += 1
        break
      case 'citation':
        citations += 1
        break
      case 'divider':
        break
    }
  }

  return {
    blocks: document.blocks.length,
    words,
    headings,
    images,
    videos,
    citations,
    sources: document.sources.length,
  }
}

export function blockTypeLabel(type: BlockType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}
