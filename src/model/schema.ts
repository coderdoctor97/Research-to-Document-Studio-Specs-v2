import { z } from 'zod'

export const SCHEMA_VERSION = 1

export const THEMES = ['classic', 'modern', 'compact'] as const
export const PAGE_SIZES = ['a4', 'letter'] as const
export const ASSET_STATUSES = ['local', 'remote', 'unresolved', 'failed'] as const

export type Theme = (typeof THEMES)[number]
export type PageSize = (typeof PAGE_SIZES)[number]
export type AssetStatus = (typeof ASSET_STATUSES)[number]

const idSchema = z.string().min(1)
const dateSchema = z.iso.datetime()
const htmlSchema = z.string()

const commonBlockFields = {
  id: idSchema,
  sourceRefs: z.array(idSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
}

export const headingBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('heading'),
  level: z.number().int().min(1).max(6),
  html: htmlSchema,
})

export const paragraphBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('paragraph'),
  html: htmlSchema,
})

export const listItemSchema = z.object({
  id: idSchema,
  html: htmlSchema,
  depth: z.number().int().min(0).max(6).default(0),
})

export const listBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('list'),
  ordered: z.boolean(),
  items: z.array(listItemSchema),
})

export const tableBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('table'),
  header: z.boolean(),
  rows: z.array(z.array(htmlSchema)),
  caption: z.string().default(''),
})

export const imageBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('image'),
  assetId: idSchema.optional(),
  url: z.string().optional(),
  alt: z.string().default(''),
  caption: z.string().default(''),
  attribution: z.string().default(''),
  align: z.enum(['left', 'center', 'right', 'full']).default('center'),
  widthPercent: z.number().int().min(10).max(100).default(100),
  status: z.enum(ASSET_STATUSES).default('remote'),
})

export const videoBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('video'),
  url: z.string(),
  title: z.string().default(''),
  caption: z.string().default(''),
  provider: z.enum(['youtube', 'vimeo', 'other']).default('other'),
})

export const citationBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('citation'),
  sourceId: idSchema.optional(),
  label: z.string(),
  url: z.string().default(''),
  quote: z.string().default(''),
  note: z.string().default(''),
})

export const calloutBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('callout'),
  variant: z.enum(['info', 'warning', 'tip']).default('info'),
  title: z.string().default(''),
  html: htmlSchema,
})

export const quoteBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('quote'),
  html: htmlSchema,
  attribution: z.string().default(''),
  url: z.string().default(''),
})

export const dividerBlockSchema = z.object({
  ...commonBlockFields,
  type: z.literal('divider'),
})

export const blockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  citationBlockSchema,
  calloutBlockSchema,
  quoteBlockSchema,
  dividerBlockSchema,
])

export const assetSchema = z.object({
  id: idSchema,
  kind: z.literal('image').default('image'),
  originalUrl: z.string().optional(),
  storageKey: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  alt: z.string().default(''),
  caption: z.string().default(''),
  attribution: z.string().default(''),
  sourceId: idSchema.optional(),
  status: z.enum(ASSET_STATUSES).default('remote'),
  retrievedAt: dateSchema.optional(),
})

export const sourceSchema = z.object({
  id: idSchema,
  url: z.string().optional(),
  label: z.string().default(''),
  title: z.string().optional(),
  publisher: z.string().optional(),
  kind: z.enum(['web', 'document', 'unknown']).default('unknown'),
  accessedAt: dateSchema.optional(),
})

export const importRecordSchema = z.object({
  id: idSchema,
  format: z.enum(['md', 'html', 'txt', 'docx', 'pdf', 'paste']),
  fileName: z.string().optional(),
  importedAt: dateSchema,
  warnings: z.array(z.string()).default([]),
  originalAvailable: z.boolean().default(false),
  blobKey: z.string().optional(),
  rawText: z.string().optional(),
  note: z.string().optional(),
})

export const exportSettingsSchema = z.object({
  theme: z.enum(THEMES).default('classic'),
  pageSize: z.enum(PAGE_SIZES).default('a4'),
  includeSourceList: z.boolean().default(true),
})

export const documentSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string(),
  blocks: z.array(blockSchema),
  assets: z.array(assetSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  imports: z.array(importRecordSchema).default([]),
  exportSettings: exportSettingsSchema.default({
    theme: 'classic',
    pageSize: 'a4',
    includeSourceList: true,
  }),
  createdAt: dateSchema,
  updatedAt: dateSchema,
})

export type HeadingBlock = z.infer<typeof headingBlockSchema>
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>
export type ListItem = z.infer<typeof listItemSchema>
export type ListBlock = z.infer<typeof listBlockSchema>
export type TableBlock = z.infer<typeof tableBlockSchema>
export type ImageBlock = z.infer<typeof imageBlockSchema>
export type VideoBlock = z.infer<typeof videoBlockSchema>
export type CitationBlock = z.infer<typeof citationBlockSchema>
export type CalloutBlock = z.infer<typeof calloutBlockSchema>
export type QuoteBlock = z.infer<typeof quoteBlockSchema>
export type DividerBlock = z.infer<typeof dividerBlockSchema>
export type Block = z.infer<typeof blockSchema>
export type Asset = z.infer<typeof assetSchema>
export type Source = z.infer<typeof sourceSchema>
export type ImportRecord = z.infer<typeof importRecordSchema>
export type ExportSettings = z.infer<typeof exportSettingsSchema>
export type Document = z.infer<typeof documentSchema>

export type BlockType = Block['type']

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  table: 'Table',
  image: 'Image',
  video: 'Video',
  citation: 'Citation',
  callout: 'Callout',
  quote: 'Quote',
  divider: 'Divider',
}
