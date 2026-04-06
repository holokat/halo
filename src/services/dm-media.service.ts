const DM_FILE_ENCRYPTION_ALGORITHM = 'aes-gcm'
const DECRYPTED_FILE_URL_CACHE_MAX = 200

type TDmFileEncryptionInfo = {
  fileType: string
  encryptionAlgorithm: string
  decryptionKey: string
  decryptionNonce: string
}

export type TEncryptedDmFilePayload = {
  encryptedFile: File
  fileType: string
  decryptionKey: string
  decryptionNonce: string
  encryptedHash: string
  originalHash: string
  encryptedSize: number
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function sha256Hex(data: ArrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(hashBuffer))
}

function getTagValue(tags: string[][], tagName: string) {
  return tags.find(([name]) => name === tagName)?.[1]
}

function getExtensionFromName(name: string) {
  const trimmedName = name.trim()
  if (!trimmedName.includes('.')) {
    return ''
  }

  const extension = trimmedName.split('.').pop() ?? ''
  return extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function getExtensionFromMimeType(type: string) {
  const subtype = type.split('/')[1]?.split(';')[0]?.trim().toLowerCase() ?? ''
  const normalizedSubtype = subtype.replace(/[^a-z0-9.+-]/g, '')

  if (!normalizedSubtype) {
    return ''
  }

  return normalizedSubtype === 'jpeg' ? 'jpg' : normalizedSubtype
}

export function getDmFileEncryptionInfo(tags: string[][]): TDmFileEncryptionInfo | null {
  const encryptionAlgorithm = getTagValue(tags, 'encryption-algorithm')?.toLowerCase()
  const decryptionKey = getTagValue(tags, 'decryption-key')
  const decryptionNonce = getTagValue(tags, 'decryption-nonce')
  const fileType = getTagValue(tags, 'file-type') || 'application/octet-stream'

  if (
    !encryptionAlgorithm ||
    !decryptionKey ||
    !decryptionNonce ||
    encryptionAlgorithm !== DM_FILE_ENCRYPTION_ALGORITHM
  ) {
    return null
  }

  return {
    fileType,
    encryptionAlgorithm,
    decryptionKey,
    decryptionNonce
  }
}

export async function createEncryptedDmFilePayload(file: File): Promise<TEncryptedDmFilePayload> {
  const originalBuffer = await file.arrayBuffer()
  const fileType = file.type || 'application/octet-stream'
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  )
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce
    },
    key,
    originalBuffer
  )
  const encryptedBytes = new Uint8Array(encryptedBuffer)
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  const decryptionKey = toBase64(rawKey)
  const decryptionNonce = toBase64(nonce)
  const encryptedHash = await sha256Hex(encryptedBuffer)
  const originalHash = await sha256Hex(originalBuffer)

  const randomId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const extension = getExtensionFromName(file.name) || getExtensionFromMimeType(fileType) || 'bin'
  const encryptedFile = new File([encryptedBytes], `dm-${randomId}.${extension}`, {
    // Keep original MIME type for better compatibility with stricter media hosts.
    type: fileType
  })

  return {
    encryptedFile,
    fileType,
    decryptionKey,
    decryptionNonce,
    encryptedHash,
    originalHash,
    encryptedSize: encryptedBytes.byteLength
  }
}

export function buildEncryptedDmFileTags(payload: TEncryptedDmFilePayload): string[][] {
  return [
    ['file-type', payload.fileType],
    ['encryption-algorithm', DM_FILE_ENCRYPTION_ALGORITHM],
    ['decryption-key', payload.decryptionKey],
    ['decryption-nonce', payload.decryptionNonce],
    ['x', payload.encryptedHash],
    ['ox', payload.originalHash],
    ['size', String(payload.encryptedSize)]
  ]
}

class DmMediaService {
  private decryptedUrlMap = new Map<string, string>()
  private decryptPromiseMap = new Map<string, Promise<string>>()

  async decryptMessageFileContent(messageId: string, encryptedUrl: string, tags: string[][]) {
    const encryptionInfo = getDmFileEncryptionInfo(tags)
    if (!encryptionInfo) {
      return encryptedUrl
    }

    const cachedUrl = this.decryptedUrlMap.get(messageId)
    if (cachedUrl) {
      return cachedUrl
    }

    const pending = this.decryptPromiseMap.get(messageId)
    if (pending) {
      return pending
    }

    const task = this.decryptToObjectUrl(encryptedUrl, encryptionInfo).then((decryptedUrl) => {
      this.decryptPromiseMap.delete(messageId)
      this.setCachedDecryptedUrl(messageId, decryptedUrl)
      return decryptedUrl
    })

    this.decryptPromiseMap.set(messageId, task)
    return task
  }

  private async decryptToObjectUrl(url: string, encryptionInfo: TDmFileEncryptionInfo) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted media: ${response.status}`)
    }

    const encryptedBuffer = await response.arrayBuffer()
    const decryptionKey = fromBase64(encryptionInfo.decryptionKey)
    const decryptionNonce = fromBase64(encryptionInfo.decryptionNonce)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      decryptionKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decryptionNonce },
      cryptoKey,
      encryptedBuffer
    )

    const decryptedBlob = new Blob([decryptedBuffer], {
      type: encryptionInfo.fileType || 'application/octet-stream'
    })
    return URL.createObjectURL(decryptedBlob)
  }

  private setCachedDecryptedUrl(messageId: string, objectUrl: string) {
    if (this.decryptedUrlMap.has(messageId)) {
      const previousUrl = this.decryptedUrlMap.get(messageId)
      if (previousUrl && previousUrl !== objectUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      this.decryptedUrlMap.delete(messageId)
    }

    this.decryptedUrlMap.set(messageId, objectUrl)

    while (this.decryptedUrlMap.size > DECRYPTED_FILE_URL_CACHE_MAX) {
      const oldestMessageId = this.decryptedUrlMap.keys().next().value as string | undefined
      if (!oldestMessageId) {
        break
      }
      const oldestUrl = this.decryptedUrlMap.get(oldestMessageId)
      if (oldestUrl) {
        URL.revokeObjectURL(oldestUrl)
      }
      this.decryptedUrlMap.delete(oldestMessageId)
    }
  }
}

const dmMediaService = new DmMediaService()

export default dmMediaService
