import type { Asset, Document, ImageBlock } from '../model/schema'
import { getAssetBlob } from '../storage/repository'
import { dataUrlToBlob } from '../import/shared'
import { blobToBytes } from '../lib/binary'

export type ImageType = 'png' | 'jpg' | 'gif' | 'bmp' | 'svg' | 'webp' | 'unknown'

export interface ResolvedImage {
  blockId: string
  dataUrl: string
  bytes: Uint8Array
  mimeType: string
  imageType: ImageType
  width?: number
  height?: number
}

export interface ExportWarning {
  code: string
  message: string
  blockId?: string
}

export interface ResolvedImages {
  byBlockId: Map<string, ResolvedImage>
  warnings: ExportWarning[]
}

const MAX_FETCH_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

export function detectImageType(bytes: Uint8Array, mimeType = '', url = ''): ImageType {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg'
  }
  if (
    bytes.length > 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'gif'
  }
  if (bytes.length > 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'bmp'
  }
  if (/svg/i.test(mimeType) || /\.svg(?:$|[?#])/i.test(url)) return 'svg'
  if (/webp/i.test(mimeType) || /\.webp(?:$|[?#])/i.test(url)) return 'webp'
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('jpeg')) return 'jpg'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('bmp')) return 'bmp'
  if (/\.png(?:$|[?#])/i.test(url)) return 'png'
  if (/\.jpe?g(?:$|[?#])/i.test(url)) return 'jpg'
  if (/\.gif(?:$|[?#])/i.test(url)) return 'gif'
  return 'unknown'
}

export function imageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const type = detectImageType(bytes)
  if (type === 'png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (type === 'gif' && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (type === 'bmp' && bytes.length >= 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      width: Math.abs(view.getInt32(18, true)),
      height: Math.abs(view.getInt32(22, true)),
    }
  }
  if (type === 'jpg') {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        }
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if (length < 2) break
      offset += 2 + length
    }
  }
  return null
}

function mimeTypeForImageType(type: ImageType): string {
  switch (type) {
    case 'png':
      return 'image/png'
    case 'jpg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function fetchRemoteImage(url: string): Promise<Blob> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`the server returned ${contentType}, not an image`)
    }
    const blob = await response.blob()
    if (blob.size > MAX_FETCH_BYTES) {
      throw new Error(`the image is larger than ${MAX_FETCH_BYTES / (1024 * 1024)} MB`)
    }
    if (blob.size === 0) {
      throw new Error('the image was empty')
    }
    return blob
  } finally {
    clearTimeout(timeout)
  }
}

function warning(
  warnings: ExportWarning[],
  code: string,
  message: string,
  blockId?: string,
): void {
  if (warnings.some((entry) => entry.code === code && entry.message === message)) return
  warnings.push({ code, message, blockId })
}

async function resolveBlockImage(
  block: ImageBlock,
  asset: Asset | undefined,
  warnings: ExportWarning[],
  remoteCache: Map<string, Promise<Blob>>,
): Promise<ResolvedImage | null> {
  let blob: Blob | null = null
  let sourceUrl = block.url?.trim() || asset?.originalUrl?.trim() || ''
  let mimeType = asset?.mimeType ?? ''

  if (asset?.storageKey) {
    blob = await getAssetBlob(asset.storageKey)
    if (!blob) {
      warning(
        warnings,
        'image-missing-local',
        'A locally saved image file is missing from browser storage. The export shows a placeholder.',
        block.id,
      )
    }
  }

  if (!blob && sourceUrl.startsWith('data:')) {
    const decoded = dataUrlToBlob(sourceUrl)
    if (decoded) {
      blob = decoded.blob
      mimeType = decoded.mimeType
    } else {
      warning(warnings, 'image-data-invalid', 'An embedded image could not be decoded.', block.id)
      sourceUrl = ''
    }
  }

  if (!blob && /^https?:\/\//i.test(sourceUrl)) {
    let pending = remoteCache.get(sourceUrl)
    if (!pending) {
      pending = fetchRemoteImage(sourceUrl)
      remoteCache.set(sourceUrl, pending)
    }
    try {
      blob = await pending
      mimeType = blob.type || mimeType
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      warning(
        warnings,
        'image-fetch-failed',
        `An image could not be downloaded (${reason}). The URL is kept and the export shows a placeholder.`,
        block.id,
      )
    }
  }

  if (!blob) {
    if (!sourceUrl && !asset?.storageKey) {
      warning(
        warnings,
        'image-source-missing',
        'An image block has no stored file or URL. The export shows a placeholder.',
        block.id,
      )
    } else if (!/^https?:\/\//i.test(sourceUrl) && !sourceUrl.startsWith('data:')) {
      warning(
        warnings,
        'image-url-unsupported',
        `An image URL is not a portable http(s) address and cannot be embedded: ${sourceUrl.slice(0, 160)}`,
        block.id,
      )
    }
    return null
  }

  const bytes = await blobToBytes(blob)
  const imageType = detectImageType(bytes, mimeType || blob.type, sourceUrl)
  if (imageType === 'unknown') {
    warning(
      warnings,
      'image-type-unknown',
      'An image format could not be identified. PDF and DOCX export may not embed it.',
      block.id,
    )
  }
  const normalizedMime = mimeType || blob.type || mimeTypeForImageType(imageType)
  const knownDimensions = imageDimensions(bytes)
  return {
    blockId: block.id,
    dataUrl: bytesToDataUrl(bytes, normalizedMime.startsWith('image/') ? normalizedMime : mimeTypeForImageType(imageType)),
    bytes,
    mimeType: normalizedMime,
    imageType,
    width: asset?.width ?? knownDimensions?.width,
    height: asset?.height ?? knownDimensions?.height,
  }
}

/**
 * Load every image block into bytes/data URLs for export. Remote images are
 * fetched without credentials and never through a proxy; failures are warnings,
 * not silent omissions.
 */
export async function resolveDocumentImages(document: Document): Promise<ResolvedImages> {
  const warnings: ExportWarning[] = []
  const byBlockId = new Map<string, ResolvedImage>()
  const remoteCache = new Map<string, Promise<Blob>>()
  const assetMap = new Map(document.assets.map((asset) => [asset.id, asset]))

  for (const block of document.blocks) {
    if (block.type !== 'image') continue
    const asset = block.assetId ? assetMap.get(block.assetId) : undefined
    const resolved = await resolveBlockImage(block, asset, warnings, remoteCache)
    if (resolved) byBlockId.set(block.id, resolved)
  }

  return { byBlockId, warnings }
}

export function isImageTypeSupportedByPdf(type: ImageType): boolean {
  return type === 'png' || type === 'jpg'
}

export function isImageTypeSupportedByDocx(type: ImageType): boolean {
  return type === 'png' || type === 'jpg' || type === 'gif' || type === 'bmp'
}
