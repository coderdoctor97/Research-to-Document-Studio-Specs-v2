import type { Block, Document, ImportRecord } from '../model/schema'
import { createDocument } from '../model/factory'
import { newId } from '../model/ids'
import { saveAssetBlob, saveImportOriginal } from '../storage/repository'
import type { ImportPreview } from '../import/types'

function importRecordFor(preview: ImportPreview, importId: string): ImportRecord {
  return {
    id: importId,
    format: preview.format,
    fileName: preview.original.fileName,
    importedAt: new Date().toISOString(),
    warnings: preview.warnings.map((warning) => warning.message),
    originalAvailable: true,
    blobKey: importId,
    rawText: preview.original.kind === 'paste' ? preview.original.text : undefined,
  }
}

async function persistAssets(preview: ImportPreview): Promise<void> {
  for (const [assetId, blob] of Object.entries(preview.assetBlobs)) {
    await saveAssetBlob(assetId, blob, blob.type)
  }
}

async function persistOriginal(preview: ImportPreview, importId: string): Promise<void> {
  await saveImportOriginal(importId, preview.original)
}

/** Save image blobs and the untouched original before the document is stored. */
export async function documentFromImport(preview: ImportPreview): Promise<Document> {
  await persistAssets(preview)
  const importId = newId('imp')
  await persistOriginal(preview, importId)

  const document = createDocument(preview.title || 'Imported document', preview.blocks)
  document.assets = preview.assets.map((asset) => ({
    ...asset,
    storageKey: preview.assetBlobs[asset.id] ? asset.id : asset.storageKey,
  }))
  document.sources = preview.sources
  document.imports = [importRecordFor(preview, importId)]
  return document
}

/**
 * Append imported content while reusing existing sources with the same URL.
 * Block sourceRefs and citation links are remapped so provenance stays valid.
 */
export async function appendImport(document: Document, preview: ImportPreview): Promise<Document> {
  await persistAssets(preview)
  const importId = newId('imp')
  await persistOriginal(preview, importId)

  const sourceIdMap = new Map<string, string>()
  const sources = [...document.sources]
  for (const source of preview.sources) {
    const existing = source.url
      ? sources.find((candidate) => candidate.url === source.url)
      : undefined
    if (existing) {
      sourceIdMap.set(source.id, existing.id)
    } else {
      sources.push(source)
      sourceIdMap.set(source.id, source.id)
    }
  }

  const blocks: Block[] = structuredClone(preview.blocks).map((block) => ({
    ...block,
    sourceRefs: block.sourceRefs
      .map((id) => sourceIdMap.get(id))
      .filter((id): id is string => Boolean(id)),
    ...(block.type === 'citation' && block.sourceId
      ? { sourceId: sourceIdMap.get(block.sourceId) ?? block.sourceId }
      : {}),
  }))

  const assets = [
    ...document.assets,
    ...preview.assets.map((asset) => ({
      ...asset,
      storageKey: preview.assetBlobs[asset.id] ? asset.id : asset.storageKey,
      sourceId: asset.sourceId ? sourceIdMap.get(asset.sourceId) ?? asset.sourceId : undefined,
    })),
  ]

  return {
    ...document,
    blocks: [...document.blocks, ...blocks],
    assets,
    sources,
    imports: [...document.imports, importRecordFor(preview, importId)],
    updatedAt: new Date().toISOString(),
  }
}
