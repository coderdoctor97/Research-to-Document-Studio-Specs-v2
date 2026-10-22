import type { Block, BlockType, Document } from './schema'
import { newId } from './ids'

export function createDocument(title = 'Untitled document', blocks: Block[] = []): Document {
  const now = new Date().toISOString()
  return {
    id: newId('doc'),
    schemaVersion: 1,
    title,
    blocks,
    assets: [],
    sources: [],
    imports: [],
    exportSettings: {
      theme: 'classic',
      pageSize: 'a4',
      includeSourceList: true,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function createBlock<T extends BlockType>(type: T): Extract<Block, { type: T }> {
  return buildBlock(type) as Extract<Block, { type: T }>
}

function buildBlock(type: BlockType): Block {
  const common = {
    id: newId('blk'),
    sourceRefs: [],
    metadata: { origin: 'user' },
  }

  switch (type) {
    case 'heading':
      return { ...common, type, level: 2, html: '' }
    case 'paragraph':
      return { ...common, type, html: '' }
    case 'list':
      return {
        ...common,
        type,
        ordered: false,
        items: [{ id: newId('li'), html: '', depth: 0 }],
      }
    case 'table':
      return {
        ...common,
        type,
        header: true,
        rows: [
          ['', ''],
          ['', ''],
        ],
        caption: '',
      }
    case 'image':
      return {
        ...common,
        type,
        alt: '',
        caption: '',
        attribution: '',
        align: 'center',
        widthPercent: 100,
        status: 'unresolved',
      }
    case 'video':
      return { ...common, type, url: '', title: '', caption: '', provider: 'other' }
    case 'citation':
      return {
        ...common,
        type,
        label: '',
        url: '',
        quote: '',
        note: '',
      }
    case 'callout':
      return { ...common, type, variant: 'info', title: '', html: '' }
    case 'quote':
      return { ...common, type, html: '', attribution: '', url: '' }
    case 'divider':
      return { ...common, type }
  }
}

export function touchDocument(document: Document): Document {
  return { ...document, updatedAt: new Date().toISOString() }
}
