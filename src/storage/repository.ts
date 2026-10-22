import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Document } from '../model/schema'
import { safeParseDocument } from '../model/migrations'
import { createDocument } from '../model/factory'
import { newId } from '../model/ids'
import type { ImportOriginal } from '../import/types'
import { blobToBytes } from '../lib/binary'

interface StoredProject {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  document: Document
}

interface StoredAsset {
  id: string
  bytes: ArrayBuffer
  mimeType: string
  createdAt: string
}

interface StoredOriginal {
  id: string
  bytes: ArrayBuffer
  fileName?: string
  mimeType?: string
  createdAt: string
}

interface StudioDB extends DBSchema {
  projects: {
    key: string
    value: StoredProject
  }
  assets: {
    key: string
    value: StoredAsset
  }
  imports: {
    key: string
    value: StoredOriginal
  }
}

const DB_NAME = 'research-to-document-studio'
const DB_VERSION = 1

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

let databasePromise: Promise<IDBPDatabase<StudioDB>> | null = null

function database(): Promise<IDBPDatabase<StudioDB>> {
  if (!databasePromise) {
    databasePromise = openDB<StudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('imports')) {
          db.createObjectStore('imports', { keyPath: 'id' })
        }
      },
    }).catch((error: unknown) => {
      databasePromise = null
      throw describeStorageError(error, 'open local storage')
    })
  }
  return databasePromise
}

function describeStorageError(error: unknown, action: string): StorageError {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new StorageError(
      `Local storage is full while trying to ${action}. Download a project backup, then remove unused projects or images.`,
    )
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new StorageError(
      `The browser blocked local storage while trying to ${action}. Private browsing can disable IndexedDB.`,
    )
  }
  const detail = error instanceof Error ? error.message : String(error)
  return new StorageError(`Could not ${action}: ${detail}`)
}

export interface ProjectSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  blockCount: number
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const db = await database()
    const projects: ProjectSummary[] = []
    let cursor = await db.transaction('projects').store.openCursor()
    while (cursor) {
      const value = cursor.value
      projects.push({
        id: value.id,
        title: value.title,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        blockCount: Array.isArray(value.document?.blocks) ? value.document.blocks.length : 0,
      })
      cursor = await cursor.continue()
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'list projects')
  }
}

export async function saveDocument(document: Document): Promise<void> {
  const parsed = safeParseDocument(document)
  if (!parsed.success || !parsed.document) {
    throw new StorageError(`Project was not saved: ${parsed.error ?? 'invalid document data'}`)
  }
  try {
    const db = await database()
    await db.put('projects', {
      id: parsed.document.id,
      title: parsed.document.title,
      createdAt: parsed.document.createdAt,
      updatedAt: parsed.document.updatedAt,
      document: parsed.document,
    })
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'save the project')
  }
}

export async function loadDocument(projectId: string): Promise<Document> {
  try {
    const db = await database()
    const project = await db.get('projects', projectId)
    if (!project) {
      throw new StorageError('This project no longer exists in local storage.')
    }
    const parsed = safeParseDocument(project.document)
    if (!parsed.success || !parsed.document) {
      throw new StorageError(
        `This project could not be opened: ${parsed.error ?? 'invalid document data'}`,
      )
    }
    return parsed.document
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'open the project')
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  try {
    const db = await database()
    await db.delete('projects', projectId)
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'delete the project')
  }
}

export async function duplicateProject(projectId: string): Promise<Document> {
  const original = await loadDocument(projectId)
  const now = new Date().toISOString()
  const copy: Document = {
    ...structuredClone(original),
    id: newId('doc'),
    title: `${original.title} copy`,
    createdAt: now,
    updatedAt: now,
  }
  await saveDocument(copy)
  return copy
}

export async function saveAssetBlob(assetId: string, blob: Blob, mimeType?: string): Promise<void> {
  if (blob.size === 0) {
    throw new StorageError('An empty image file cannot be stored.')
  }
  try {
    const db = await database()
    await db.put('assets', {
      id: assetId,
      bytes: copyToArrayBuffer(await blobToBytes(blob)),
      mimeType: mimeType || blob.type || 'application/octet-stream',
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'save an image')
  }
}

export async function getAssetBlob(assetId: string): Promise<Blob | null> {
  try {
    const db = await database()
    const asset = await db.get('assets', assetId)
    if (!asset) return null
    return new Blob([asset.bytes], { type: asset.mimeType })
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'read a saved image')
  }
}

export async function hasAssetBlob(assetId: string): Promise<boolean> {
  try {
    const db = await database()
    const key = await db.getKey('assets', assetId)
    return key !== undefined
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'check a saved image')
  }
}

export async function saveImportOriginal(
  importId: string,
  original: ImportOriginal,
): Promise<void> {
  try {
    const blob =
      original.blob ??
      new Blob([original.text ?? ''], { type: original.mimeType || 'text/plain;charset=utf-8' })
    if (blob.size === 0) {
      throw new StorageError('The original import was empty and could not be stored.')
    }
    const db = await database()
    await db.put('imports', {
      id: importId,
      bytes: copyToArrayBuffer(await blobToBytes(blob)),
      fileName: original.fileName,
      mimeType: original.mimeType || blob.type,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'store the original import')
  }
}

export async function getImportOriginal(
  importId: string,
): Promise<{ blob: Blob; fileName?: string } | null> {
  try {
    const db = await database()
    const stored = await db.get('imports', importId)
    if (!stored) return null
    return {
      blob: new Blob([stored.bytes], { type: stored.mimeType || 'application/octet-stream' }),
      fileName: stored.fileName,
    }
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'read the original import')
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') return null
  try {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}

/** Used by tests and the backup flow to start from a clean local database. */
export async function clearAllLocalData(): Promise<void> {
  try {
    const db = await database()
    await Promise.all([
      db.clear('projects'),
      db.clear('assets'),
      db.clear('imports'),
    ])
  } catch (error) {
    throw error instanceof StorageError ? error : describeStorageError(error, 'clear local storage')
  }
}

export { createDocument }
