import { useEffect, useState } from 'react'
import { getAssetBlob } from '../storage/repository'
import type { Asset } from '../model/schema'

export interface AssetUrlState {
  src?: string
  loading: boolean
  error?: string
}

/** Resolve an IndexedDB image to a revocable object URL, falling back to its remote URL. */
export function useAssetUrl(assetId: string | undefined, remoteUrl: string | undefined): AssetUrlState {
  const [stored, setStored] = useState<AssetUrlState>({ loading: Boolean(assetId) })
  const [remoteFailed, setRemoteFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    setRemoteFailed(false)

    if (!assetId) {
      setStored({ loading: false })
      return
    }

    setStored({ loading: true })
    getAssetBlob(assetId)
      .then((blob) => {
        if (!active) return
        if (blob) {
          objectUrl = URL.createObjectURL(blob)
          setStored({ src: objectUrl, loading: false })
        } else {
          setStored({ loading: false })
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setStored({
          loading: false,
          error: error instanceof Error ? error.message : 'Saved image could not be read.',
        })
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])

  if (stored.src) return stored
  if (remoteUrl && !remoteFailed) {
    return { src: remoteUrl, loading: false, error: stored.error }
  }
  return stored
}

export function useAssetBlobUrl(asset: Asset | undefined): AssetUrlState {
  return useAssetUrl(asset?.id, asset?.originalUrl)
}

export function useAssetThumbnails(assets: Asset[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const signature = assets.map((asset) => asset.id).join('|')

  useEffect(() => {
    let active = true
    const created: string[] = []
    const next: Record<string, string> = {}

    async function load() {
      for (const asset of assets) {
        if (asset.status !== 'local') continue
        try {
          const blob = await getAssetBlob(asset.id)
          if (!blob || !active) continue
          const url = URL.createObjectURL(blob)
          created.push(url)
          next[asset.id] = url
        } catch {
          // Thumbnails are decorative; the registry still shows the asset row.
        }
      }
      if (active) setUrls(next)
    }

    void load()
    return () => {
      active = false
      created.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return urls
}
