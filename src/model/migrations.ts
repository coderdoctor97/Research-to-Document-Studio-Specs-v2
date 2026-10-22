import { SCHEMA_VERSION, documentSchema, type Document } from './schema'
import { newId } from './ids'
import { escapeHtml } from './inline'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export class SchemaMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaMigrationError'
  }
}

function legacyTextToHtml(value: unknown): string {
  const text = asString(value)
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => escapeHtml(part).replace(/\n/g, '<br>'))
    .join('<br><br>')
}

function migrateV0Block(raw: unknown): JsonRecord {
  const block = isRecord(raw) ? raw : {}
  const type = asString(block.type, 'paragraph')
  const metadata = isRecord(block.metadata) ? block.metadata : {}
  const common: JsonRecord = {
    id: asString(block.id) || newId('blk'),
    sourceRefs: asArray(block.sourceRefs).filter((item): item is string => typeof item === 'string'),
    metadata,
  }

  switch (type) {
    case 'heading':
      return {
        ...common,
        type,
        level: typeof block.level === 'number' ? Math.min(6, Math.max(1, Math.round(block.level))) : 1,
        html: legacyTextToHtml(block.html ?? block.text),
      }
    case 'paragraph':
      return { ...common, type, html: legacyTextToHtml(block.html ?? block.text) }
    case 'list':
      return {
        ...common,
        type,
        ordered: block.ordered === true,
        items: asArray(block.items).map((item) => {
          const entry = isRecord(item) ? item : {}
          return {
            id: asString(entry.id) || newId('li'),
            html: legacyTextToHtml(entry.html ?? entry.text ?? item),
            depth: typeof entry.depth === 'number' ? entry.depth : 0,
          }
        }),
      }
    case 'table':
      return {
        ...common,
        type,
        header: block.header !== false,
        rows: asArray(block.rows).map((row) =>
          asArray(row).map((cell) => legacyTextToHtml(cell)),
        ),
        caption: asString(block.caption),
      }
    case 'image':
      return {
        ...common,
        type,
        url: asString(block.url ?? block.src) || undefined,
        alt: asString(block.alt),
        caption: asString(block.caption),
        attribution: asString(block.attribution),
        align: asString(block.align, 'center'),
        widthPercent: 100,
        status: asString(block.status, asString(block.url ?? block.src) ? 'remote' : 'unresolved'),
      }
    case 'video':
      return {
        ...common,
        type,
        url: asString(block.url ?? block.src),
        title: asString(block.title),
        caption: asString(block.caption),
        provider: 'other',
      }
    case 'citation':
      return {
        ...common,
        type,
        label: asString(block.label ?? block.text),
        url: asString(block.url),
        quote: asString(block.quote),
        note: asString(block.note),
      }
    case 'callout':
      return {
        ...common,
        type,
        variant: asString(block.variant, 'info'),
        title: asString(block.title),
        html: legacyTextToHtml(block.html ?? block.text),
      }
    case 'quote':
      return {
        ...common,
        type,
        html: legacyTextToHtml(block.html ?? block.text),
        attribution: asString(block.attribution),
        url: asString(block.url),
      }
    case 'divider':
      return { ...common, type }
    default:
      // Unknown legacy types keep their text instead of disappearing.
      return {
        ...common,
        type: 'paragraph',
        html: legacyTextToHtml(block.text ?? block.html),
        metadata: { ...metadata, migratedFromType: type },
      }
  }
}

function migrateV0(raw: JsonRecord): JsonRecord {
  const now = new Date().toISOString()
  return {
    id: asString(raw.id) || newId('doc'),
    schemaVersion: 1,
    title: asString(raw.title, 'Untitled document'),
    blocks: asArray(raw.blocks).map(migrateV0Block),
    assets: asArray(raw.assets)
      .filter(isRecord)
      .map((asset) => ({
        ...asset,
        id: asString(asset.id) || newId('asset'),
        kind: 'image',
        status: asString(asset.status, 'unresolved'),
      })),
    sources: asArray(raw.sources)
      .filter(isRecord)
      .map((source) => ({
        ...source,
        id: asString(source.id) || newId('src'),
      })),
    imports: asArray(raw.imports).filter(isRecord),
    exportSettings: isRecord(raw.exportSettings) ? raw.exportSettings : {},
    createdAt: asString(raw.createdAt, now),
    updatedAt: asString(raw.updatedAt, now),
  }
}

/**
 * Explicit migration ladder. Add one function per version step and a test for
 * every step. Never drop unknown content without recording it in metadata.
 */
const MIGRATIONS: Record<number, (raw: JsonRecord) => JsonRecord> = {
  0: migrateV0,
}

export function migrateDocument(raw: unknown): unknown {
  if (!isRecord(raw)) {
    throw new SchemaMigrationError('Document data is not a JSON object.')
  }
  const declaredVersion =
    typeof raw.schemaVersion === 'number'
      ? raw.schemaVersion
      : typeof raw.version === 'number'
        ? raw.version
        : 0

  if (!Number.isInteger(declaredVersion) || declaredVersion < 0) {
    throw new SchemaMigrationError(`Invalid schema version: ${String(declaredVersion)}.`)
  }
  if (declaredVersion > SCHEMA_VERSION) {
    throw new SchemaMigrationError(
      `This project uses schema version ${declaredVersion}; this app supports version ${SCHEMA_VERSION}.`,
    )
  }

  let version = declaredVersion
  let data = raw
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      throw new SchemaMigrationError(`No migration path from schema version ${version}.`)
    }
    data = migration(data)
    version += 1
  }
  return { ...data, schemaVersion: SCHEMA_VERSION }
}

export interface DocumentParseResult {
  success: boolean
  document?: Document
  error?: string
}

export function parseDocument(raw: unknown): Document {
  return documentSchema.parse(migrateDocument(raw))
}

export function safeParseDocument(raw: unknown): DocumentParseResult {
  try {
    return { success: true, document: parseDocument(raw) }
  } catch (error) {
    if (error instanceof SchemaMigrationError) {
      return { success: false, error: error.message }
    }
    if (error instanceof Error) {
      return { success: false, error: `Invalid project data: ${error.message}` }
    }
    return { success: false, error: 'Invalid project data.' }
  }
}
