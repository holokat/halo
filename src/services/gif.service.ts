import type { ImageAttachment } from './post-editor-cache.service'
import mediaUpload from './media-upload.service'

const KLIPY_BASE_URL = 'https://api.klipy.com'
const DEFAULT_KLIPY_APP_KEY = 'dX6PP8oWX2kZFBuIq9fBOQOT3LBsniCzMqcNuBe0HksGkNGMdkBY4bgmgdW1uH2R'
const KLIPY_CUSTOMER_ID_KEY = 'flow.klipy.anonymousCustomerID'
const DEFAULT_PAGE_SIZE = 24
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env

type KlipyAssetFormat = 'gif' | 'jpg' | 'mp4' | 'webp'

export interface KlipyGIFAsset {
  url: string
  width?: number
  height?: number
  size?: number
  mimeType: string
  fileExtension: string
}

type KlipyFilesBySize = Record<string, Partial<Record<KlipyAssetFormat, KlipyGIFAsset>>>

export interface GifData {
  id: string
  apiId: string
  slug: string
  title: string
  alt: string
  url: string
  previewUrl?: string
  animatedPreviewUrl?: string
  mp4Url?: string
  gifUrl?: string
  width?: number
  height?: number
  size?: number
  customerId: string
  searchQuery?: string
  filesBySize: KlipyFilesBySize
}

export interface GifSearchResult {
  gifs: GifData[]
  hasMore: boolean
}

type KlipyGIFListResponse = {
  result?: boolean
  data?: {
    data?: unknown[]
    has_next?: boolean
  }
}

type UploadGifOptions = {
  onProgress?: (progressPercent: number) => void
}

const MIME_BY_FORMAT: Record<KlipyAssetFormat, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  webp: 'image/webp'
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseKlipyAsset(value: unknown, format: KlipyAssetFormat): KlipyGIFAsset | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const url = readString(record.url).trim()
  if (!url) return null

  return {
    url,
    width: readNumber(record.width),
    height: readNumber(record.height),
    size: readNumber(record.size),
    mimeType: MIME_BY_FORMAT[format],
    fileExtension: format === 'jpg' ? 'jpg' : format
  }
}

function assetFromSizes(
  filesBySize: KlipyFilesBySize,
  format: KlipyAssetFormat,
  preferredSizes: string[]
) {
  for (const size of preferredSizes) {
    const asset = filesBySize[size]?.[format]
    if (asset) return asset
  }

  for (const formats of Object.values(filesBySize)) {
    const asset = formats[format]
    if (asset) return asset
  }

  return undefined
}

function preferredPreviewAsset(filesBySize: KlipyFilesBySize) {
  return (
    assetFromSizes(filesBySize, 'jpg', ['sm', 'md', 'hd', 'xs', 'tiny']) ??
    assetFromSizes(filesBySize, 'webp', ['sm', 'md', 'hd', 'xs', 'tiny']) ??
    preferredPublishAsset(filesBySize)
  )
}

function preferredPublishAsset(filesBySize: KlipyFilesBySize) {
  return (
    assetFromSizes(filesBySize, 'mp4', ['md', 'sm', 'hd', 'xs', 'tiny']) ??
    assetFromSizes(filesBySize, 'gif', ['md', 'sm', 'xs', 'tiny', 'hd'])
  )
}

function preferredAnimatedPreviewAsset(filesBySize: KlipyFilesBySize) {
  return (
    assetFromSizes(filesBySize, 'mp4', ['sm', 'md', 'xs', 'tiny', 'hd']) ??
    assetFromSizes(filesBySize, 'gif', ['sm', 'md', 'xs', 'tiny', 'hd'])
  )
}

export function parseKlipyGIFItem(
  value: unknown,
  customerId: string,
  searchQuery?: string
): GifData | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const rawId = record.id
  const apiId = typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : ''
  if (!apiId) return null

  const file = record.file
  if (!file || typeof file !== 'object') return null

  const filesBySize: KlipyFilesBySize = {}
  for (const [sizeKey, formatsValue] of Object.entries(file as Record<string, unknown>)) {
    if (!formatsValue || typeof formatsValue !== 'object') continue
    const normalizedSize = sizeKey.toLowerCase()
    const formats: Partial<Record<KlipyAssetFormat, KlipyGIFAsset>> = {}

    for (const format of ['gif', 'jpg', 'mp4', 'webp'] as KlipyAssetFormat[]) {
      const asset = parseKlipyAsset((formatsValue as Record<string, unknown>)[format], format)
      if (asset) {
        formats[format] = asset
      }
    }

    if (Object.keys(formats).length > 0) {
      filesBySize[normalizedSize] = formats
    }
  }

  const publishAsset = preferredPublishAsset(filesBySize)
  if (!publishAsset) return null

  const previewAsset = preferredPreviewAsset(filesBySize)
  const animatedPreviewAsset = preferredAnimatedPreviewAsset(filesBySize)
  const slug = readString(record.slug).trim() || apiId
  const title = readString(record.title).trim()

  return {
    id: slug,
    apiId,
    slug,
    title,
    alt: title || 'GIF',
    url: publishAsset.url,
    previewUrl: previewAsset?.url,
    animatedPreviewUrl: animatedPreviewAsset?.url,
    mp4Url:
      preferredPublishAsset(filesBySize)?.mimeType === 'video/mp4' ? publishAsset.url : undefined,
    gifUrl: assetFromSizes(filesBySize, 'gif', ['md', 'sm', 'xs', 'tiny', 'hd'])?.url,
    width: publishAsset.width,
    height: publishAsset.height,
    size: publishAsset.size,
    customerId,
    searchQuery,
    filesBySize
  }
}

export function buildGifLoopImetaTag(params: {
  uploadTags?: string[][]
  url: string
  mimeType: string
  size?: number
  width?: number
  height?: number
  alt?: string
  gifLoop?: boolean
}) {
  const values: string[] = []
  const seenPrefixes = new Set<string>()

  const append = (prefix: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    const key = prefix.toLowerCase()
    seenPrefixes.add(key)
    values.push(`${prefix} ${value}`)
  }

  append('url', params.url)

  for (const tag of params.uploadTags ?? []) {
    const [name, value] = tag
    if (!name || !value) continue
    const key = name.toLowerCase()
    if (key === 'url' || key === 'm' || key === 'size' || key === 'dim' || key === 'alt') {
      continue
    }
    append(name, value)
  }

  append('m', params.mimeType)
  append('size', params.size)

  if (params.width && params.height) {
    append('dim', `${Math.round(params.width)}x${Math.round(params.height)}`)
  }

  if (params.alt?.trim()) {
    append('alt', params.alt.trim())
  }

  if (params.gifLoop && !seenPrefixes.has('flow-gif-loop')) {
    append('flow-gif-loop', '1')
  }

  return ['imeta', ...values]
}

class GifService {
  static readonly defaultPageSize = DEFAULT_PAGE_SIZE

  private readonly appKey = env?.VITE_KLIPY_APP_KEY?.trim() || DEFAULT_KLIPY_APP_KEY

  async fetchRecentGifs(
    limit: number = DEFAULT_PAGE_SIZE,
    offset: number = 0,
    accountPubkey?: string
  ): Promise<GifSearchResult> {
    return this.fetchGIFs({
      path: 'gifs/trending',
      limit,
      offset,
      accountPubkey
    })
  }

  async searchGifs(
    query: string,
    limit: number = DEFAULT_PAGE_SIZE,
    offset: number = 0,
    accountPubkey?: string
  ): Promise<GifSearchResult> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return this.fetchRecentGifs(limit, offset, accountPubkey)
    }

    return this.fetchGIFs({
      path: 'gifs/search',
      limit,
      offset,
      query: trimmedQuery,
      accountPubkey
    })
  }

  async createAttachmentFromGif(
    gif: GifData,
    options?: UploadGifOptions
  ): Promise<ImageAttachment> {
    const asset = preferredPublishAsset(gif.filesBySize)
    if (!asset) {
      throw new Error("That GIF doesn't have an animated file.")
    }

    options?.onProgress?.(5)
    const response = await fetch(asset.url)
    if (!response.ok) {
      throw new Error(`Couldn't download that GIF (${response.status}).`)
    }

    const blob = await response.blob()
    const mimeType = asset.mimeType || blob.type || 'application/octet-stream'
    const file = new File([blob], this.filenameForGif(gif, asset.fileExtension), {
      type: mimeType,
      lastModified: Date.now()
    })

    options?.onProgress?.(18)
    const uploadResult = await mediaUpload.upload(file, {
      onProgress: (progress) => {
        options?.onProgress?.(18 + Math.round(progress * 0.82))
      },
      skipImageConversion: true
    })

    const gifLoop = mimeType.startsWith('video/')
    const imetaTag = buildGifLoopImetaTag({
      uploadTags: uploadResult.tags,
      url: uploadResult.url,
      mimeType,
      size: file.size || asset.size,
      width: asset.width,
      height: asset.height,
      alt: gif.alt,
      gifLoop
    })

    mediaUpload.setImetaTagByUrl(uploadResult.url, imetaTag)

    return {
      url: uploadResult.url,
      alt: gif.alt,
      mimeType,
      fileSizeBytes: file.size || asset.size,
      width: asset.width,
      height: asset.height,
      gifLoop,
      previewUrl: gif.previewUrl,
      imetaTag
    }
  }

  async registerShare(gif: GifData): Promise<void> {
    if (!gif.slug.trim()) return

    try {
      const url = new URL(
        `${KLIPY_BASE_URL}/api/v1/${this.appKey}/gifs/share/${encodeURIComponent(gif.slug)}`
      )
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer_id: gif.customerId,
          q: gif.searchQuery?.trim() || undefined
        })
      })
    } catch {
      // Share registration is analytics-only; never block the composer on it.
    }
  }

  getCacheSize(): number {
    return 0
  }

  onCacheUpdate(): () => void {
    return () => undefined
  }

  private async fetchGIFs({
    path,
    limit,
    offset,
    query,
    accountPubkey
  }: {
    path: string
    limit: number
    offset: number
    query?: string
    accountPubkey?: string
  }): Promise<GifSearchResult> {
    const customerId = this.customerId(accountPubkey)
    const page = Math.max(Math.floor(offset / Math.max(limit, 1)) + 1, 1)
    const perPage = Math.min(Math.max(limit, 1), 50)
    const url = new URL(`${KLIPY_BASE_URL}/api/v1/${this.appKey}/${path}`)

    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))
    url.searchParams.set('customer_id', customerId)
    url.searchParams.set('format_filter', 'gif,jpg,mp4,webp')

    const locale = this.localeCode()
    if (locale) {
      url.searchParams.set('locale', locale)
    }

    if (query?.trim()) {
      url.searchParams.set('q', query.trim())
      url.searchParams.set('content_filter', 'low')
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Klipy request failed (${response.status}).`)
    }

    const payload = (await response.json()) as KlipyGIFListResponse
    if (!payload.result || !Array.isArray(payload.data?.data)) {
      throw new Error('Klipy returned an invalid response.')
    }

    return {
      gifs: payload.data.data
        .map((item) => parseKlipyGIFItem(item, customerId, query))
        .filter((item): item is GifData => item !== null),
      hasMore: !!payload.data.has_next
    }
  }

  private customerId(accountPubkey?: string) {
    const normalizedPubkey = accountPubkey?.trim().toLowerCase()
    if (normalizedPubkey) {
      return normalizedPubkey
    }

    const storage = globalThis.window?.localStorage
    const existingId = storage?.getItem(KLIPY_CUSTOMER_ID_KEY)?.trim()
    if (existingId) {
      return existingId
    }

    const createdId = `flow-${crypto.randomUUID().toLowerCase()}`
    storage?.setItem(KLIPY_CUSTOMER_ID_KEY, createdId)
    return createdId
  }

  private localeCode() {
    const locale = navigator.language || ''
    const [, region] = locale.split('-')
    return (region || locale.split('-')[0] || '').toLowerCase() || undefined
  }

  private filenameForGif(gif: GifData, fileExtension: string) {
    const safeSlug =
      gif.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'klipy-gif'

    return `${safeSlug}-${Date.now()}.${fileExtension}`
  }
}

const gifService = new GifService()
export default gifService
