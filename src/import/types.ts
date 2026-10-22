import type { Asset, Block, ImportRecord, Source } from '../model/schema'

export type ImportFormat = ImportRecord['format']
export type FileImportFormat = Exclude<ImportFormat, 'paste'>

export interface ImportWarning {
  code: string
  message: string
  severity: 'info' | 'warning'
}

export interface ImportOriginal {
  kind: 'file' | 'paste'
  fileName?: string
  mimeType?: string
  blob?: Blob
  text?: string
}

export interface ImportStats {
  blocks: number
  words: number
  images: number
  links: number
}

export interface ImportPreview {
  format: ImportFormat
  title: string
  blocks: Block[]
  assets: Asset[]
  assetBlobs: Record<string, Blob>
  sources: Source[]
  warnings: ImportWarning[]
  stats: ImportStats
  original: ImportOriginal
}

export interface ImportOptions {
  fileName?: string
  mimeType?: string
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export const SUPPORTED_EXTENSIONS = ['md', 'markdown', 'html', 'htm', 'txt', 'docx', 'pdf'] as const
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index + 1).toLowerCase()
}

export function formatFromFileName(fileName: string): FileImportFormat | null {
  const extension = extensionOf(fileName)
  if (extension === 'md' || extension === 'markdown') return 'md'
  if (extension === 'html' || extension === 'htm') return 'html'
  if (extension === 'txt') return 'txt'
  if (extension === 'docx') return 'docx'
  if (extension === 'pdf') return 'pdf'
  return null
}

export function formatFromMimeType(mimeType: string): FileImportFormat | null {
  const normalized = mimeType.toLowerCase()
  if (normalized === 'text/markdown') return 'md'
  if (normalized === 'text/html') return 'html'
  if (normalized === 'text/plain') return 'txt'
  if (normalized === 'application/pdf') return 'pdf'
  if (normalized.includes('wordprocessingml')) return 'docx'
  return null
}

export function resolveImportFormat(file: File): FileImportFormat | null {
  return formatFromFileName(file.name) ?? formatFromMimeType(file.type)
}
