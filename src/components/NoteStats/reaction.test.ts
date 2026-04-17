import assert from 'node:assert/strict'
import test from 'node:test'
import { kinds, type Event as NostrEvent } from 'nostr-tools'

function installTestWindow() {
  const storage = new Map<string, string>()
  const createRequest = <T,>(result: T) => {
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
    },
    navigator: {}
  }
}

test('boosted optimistic reactions roll back when publishing fails', async (t) => {
  installTestWindow()

  const [{ default: client }, { default: noteStatsService }, reactionModule, reactionLib] =
    await Promise.all([
      import('../../services/client.service.ts'),
      import('../../services/note-stats.service.ts'),
      import('./reaction.ts'),
      import('../../lib/reaction.ts')
    ])

  const { beginOptimisticReaction } = reactionModule
  const { getWeightedReactionCount } = reactionLib

  t.mock.method(client, 'getSeenEventRelayUrls', () => [])

  const targetEvent = {
    id: '1'.repeat(64),
    pubkey: '2'.repeat(64),
    kind: kinds.ShortTextNote,
    content: 'hello',
    tags: [],
    created_at: 1,
    sig: ''
  } as NostrEvent

  const { publishTask } = beginOptimisticReaction(
    targetEvent,
    '+',
    '3'.repeat(64),
    async () => {
      throw new Error('publish failed')
    },
    { bonusCount: 4 }
  )

  assert.equal(
    getWeightedReactionCount(noteStatsService.getNoteStats(targetEvent.id)?.likes ?? []),
    5
  )

  await assert.rejects(publishTask, /publish failed/)

  assert.equal(
    getWeightedReactionCount(noteStatsService.getNoteStats(targetEvent.id)?.likes ?? []),
    0
  )
})
