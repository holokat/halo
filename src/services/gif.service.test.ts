import assert from 'node:assert/strict'
import test from 'node:test'

function installTestWindow() {
  const storage = new Map<string, string>()
  const createRequest = <T>(result: T) => {
    const request: any = {
      result,
      onsuccess: null as ((event: unknown) => void) | null,
      onerror: null as ((event: unknown) => void) | null,
      onupgradeneeded: null as ((event: unknown) => void) | null
    }

    queueMicrotask(() => {
      request.onupgradeneeded?.({ target: request })
      request.onsuccess?.({ target: request })
    })

    return request
  }
  const store = {
    createIndex: () => undefined,
    get: () => createRequest(undefined),
    put: () => createRequest(undefined),
    delete: () => createRequest(undefined),
    getAll: () => createRequest([]),
    count: () => createRequest(0),
    clear: () => createRequest(undefined),
    openCursor: () => createRequest(null)
  }
  const transaction = {
    objectStore: () => store,
    commit: () => undefined,
    abort: () => undefined
  }
  const db = {
    objectStoreNames: {
      contains: () => true
    },
    createObjectStore: () => store,
    deleteObjectStore: () => undefined,
    transaction: () => transaction,
    close: () => undefined
  }

  ;(globalThis as any).window = {
    location: {
      origin: 'http://localhost'
    },
    indexedDB: {
      open: () => createRequest(db)
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
      key: () => null,
      length: 0
    }
  }
}

test('Klipy GIF items prefer JPG previews and Klipy MP4 publish assets', async () => {
  installTestWindow()
  const { parseKlipyGIFItem } = await import('./gif.service.ts')

  const item = parseKlipyGIFItem(
    {
      id: 8041071659142944,
      slug: 'hello-hi-662',
      title: 'Hello',
      file: {
        hd: {
          gif: {
            url: 'https://static.klipy.com/hello-hd.gif',
            width: 498,
            height: 498,
            size: 4_001_918
          },
          jpg: {
            url: 'https://static.klipy.com/hello-hd.jpg',
            width: 498,
            height: 498,
            size: 19_255
          },
          mp4: {
            url: 'https://static.klipy.com/hello-hd.mp4',
            width: 498,
            height: 498,
            size: 180_000
          }
        },
        md: {
          gif: {
            url: 'https://static.klipy.com/hello-md.gif',
            width: 320,
            height: 320,
            size: 1_200_000
          },
          mp4: {
            url: 'https://static.klipy.com/hello-md.mp4',
            width: 320,
            height: 320,
            size: 72_000
          }
        },
        sm: {
          jpg: {
            url: 'https://static.klipy.com/hello-sm.jpg',
            width: 200,
            height: 200,
            size: 8_000
          },
          mp4: {
            url: 'https://static.klipy.com/hello-sm.mp4',
            width: 200,
            height: 200,
            size: 42_000
          }
        }
      }
    },
    'customer-123',
    'hello'
  )

  assert.ok(item)
  assert.equal(item.slug, 'hello-hi-662')
  assert.equal(item.customerId, 'customer-123')
  assert.equal(item.searchQuery, 'hello')
  assert.equal(item.previewUrl, 'https://static.klipy.com/hello-sm.jpg')
  assert.equal(item.url, 'https://static.klipy.com/hello-md.mp4')
  assert.equal(item.mp4Url, 'https://static.klipy.com/hello-md.mp4')
  assert.equal(item.gifUrl, 'https://static.klipy.com/hello-md.gif')
})

test('Klipy GIF items fall back to GIF when no MP4 is available', async () => {
  installTestWindow()
  const { parseKlipyGIFItem } = await import('./gif.service.ts')

  const item = parseKlipyGIFItem(
    {
      id: 'still-animated',
      slug: 'gif-only',
      title: 'GIF only',
      file: {
        md: {
          gif: {
            url: 'https://static.klipy.com/gif-only.gif',
            width: 320,
            height: 240,
            size: 900_000
          }
        }
      }
    },
    'customer-123'
  )

  assert.ok(item)
  assert.equal(item.url, 'https://static.klipy.com/gif-only.gif')
  assert.equal(item.mp4Url, undefined)
})

test('GIF loop imeta tags mark converted MP4s for muted autoplay loops', async () => {
  installTestWindow()
  const { buildGifLoopImetaTag } = await import('./gif.service.ts')

  const tag = buildGifLoopImetaTag({
    uploadTags: [
      ['url', 'https://media.example/old.mp4'],
      ['x', 'abc123']
    ],
    url: 'https://media.example/final.mp4',
    mimeType: 'video/mp4',
    size: 42_000,
    width: 320,
    height: 240,
    alt: 'Hello',
    gifLoop: true
  })

  assert.deepEqual(tag, [
    'imeta',
    'url https://media.example/final.mp4',
    'x abc123',
    'm video/mp4',
    'size 42000',
    'dim 320x240',
    'alt Hello',
    'flow-gif-loop 1'
  ])
})
