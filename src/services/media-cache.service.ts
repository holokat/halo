import { isImage } from '@/lib/url'

const MEDIA_CACHE_NAME = 'x21-media-cache-v1'

type TMediaCacheStats = {
  bytes: number
  count: number
}

class MediaCacheService {
  private objectUrlMap = new Map<string, { objectUrl: string; refCount: number }>()
  private inflightReadMap = new Map<string, Promise<string | null>>()
  private inflightWriteMap = new Map<string, Promise<void>>()
  private updateCallbacks = new Set<() => void>()

  private canUseCache(url?: string) {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return false
    }

    if (!url) {
      return true
    }

    return /^https?:\/\//i.test(url)
  }

  private async openCache() {
    return await caches.open(MEDIA_CACHE_NAME)
  }

  async getCachedImageUrl(url: string): Promise<string | null> {
    if (!this.canUseCache(url) || !isImage(url)) {
      return null
    }

    const cachedObjectUrl = this.objectUrlMap.get(url)
    if (cachedObjectUrl) {
      cachedObjectUrl.refCount += 1
      return cachedObjectUrl.objectUrl
    }

    const inflightRead = this.inflightReadMap.get(url)
    if (inflightRead) {
      const objectUrl = await inflightRead
      if (!objectUrl) {
        return null
      }

      const entry = this.objectUrlMap.get(url)
      if (entry) {
        entry.refCount += 1
      }
      return objectUrl
    }

    const readPromise = (async () => {
      try {
        const cache = await this.openCache()
        const cachedResponse = await cache.match(url)
        if (!cachedResponse) {
          return null
        }

        const cachedBlob = await cachedResponse.blob()
        if (!cachedBlob.size) {
          return null
        }

        const objectUrl = URL.createObjectURL(cachedBlob)
        this.objectUrlMap.set(url, { objectUrl, refCount: 1 })
        return objectUrl
      } catch {
        return null
      } finally {
        this.inflightReadMap.delete(url)
      }
    })()

    this.inflightReadMap.set(url, readPromise)
    return await readPromise
  }

  releaseImageUrl(url: string) {
    const entry = this.objectUrlMap.get(url)
    if (!entry) {
      return
    }

    entry.refCount -= 1
    if (entry.refCount > 0) {
      return
    }

    URL.revokeObjectURL(entry.objectUrl)
    this.objectUrlMap.delete(url)
  }

  async ensureImageCached(url: string): Promise<void> {
    if (!this.canUseCache(url) || !isImage(url)) {
      return
    }

    const inflightWrite = this.inflightWriteMap.get(url)
    if (inflightWrite) {
      return inflightWrite
    }

    const writePromise = (async () => {
      try {
        const cache = await this.openCache()
        const existingResponse = await cache.match(url)
        if (existingResponse) {
          return
        }

        const response = await fetch(url, { cache: 'force-cache' })
        if (!response.ok) {
          return
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (contentType && !contentType.startsWith('image/')) {
          return
        }

        await cache.put(url, response.clone())
        this.notifyUpdate()
      } catch {
        // Best effort cache warming. Ignore failures and keep the current UI path.
      } finally {
        this.inflightWriteMap.delete(url)
      }
    })()

    this.inflightWriteMap.set(url, writePromise)
    return writePromise
  }

  async getCacheStats(): Promise<TMediaCacheStats> {
    if (!this.canUseCache()) {
      return { bytes: 0, count: 0 }
    }

    try {
      const cache = await this.openCache()
      const requests = await cache.keys()
      const sizes = await Promise.all(
        requests.map(async (request) => {
          try {
            const response = await cache.match(request)
            if (!response) {
              return 0
            }

            const contentLength = response.headers.get('content-length')
            if (contentLength) {
              const parsed = Number(contentLength)
              if (Number.isFinite(parsed) && parsed >= 0) {
                return parsed
              }
            }

            const blob = await response.blob()
            return blob.size
          } catch {
            return 0
          }
        })
      )

      return {
        bytes: sizes.reduce((total, size) => total + size, 0),
        count: requests.length
      }
    } catch {
      return { bytes: 0, count: 0 }
    }
  }

  async clearCache(): Promise<void> {
    if (!this.canUseCache()) {
      return
    }

    this.objectUrlMap.forEach(({ objectUrl }) => {
      URL.revokeObjectURL(objectUrl)
    })
    this.objectUrlMap.clear()

    await caches.delete(MEDIA_CACHE_NAME)
    this.notifyUpdate()
  }

  onCacheUpdate(callback: () => void) {
    this.updateCallbacks.add(callback)
    return () => {
      this.updateCallbacks.delete(callback)
    }
  }

  private notifyUpdate() {
    this.updateCallbacks.forEach((callback) => {
      try {
        callback()
      } catch (error) {
        console.error('[media-cache] cache update callback failed:', error)
      }
    })
  }
}

const mediaCacheService = new MediaCacheService()
export default mediaCacheService
