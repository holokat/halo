import assert from 'node:assert/strict'
import test from 'node:test'
import { kinds, type Event as NostrEvent } from 'nostr-tools'
import {
  getReactionBonusCountFromTags,
  getWeightedReactionCount,
  summarizeReactions
} from './reaction.ts'

const TARGET_EVENT = {
  id: '1'.repeat(64),
  pubkey: '2'.repeat(64),
  kind: kinds.ShortTextNote,
  content: 'hello',
  tags: [],
  created_at: 1,
  sig: ''
} as NostrEvent

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

test('reaction bonus tag parsing clamps invalid values without capping positive bonuses', () => {
  assert.equal(getReactionBonusCountFromTags([['reaction_bonus', '3']]), 3)
  assert.equal(getReactionBonusCountFromTags([['reaction_bonus', '-2']]), 0)
  assert.equal(getReactionBonusCountFromTags([['reaction_bonus', '999']]), 999)
  assert.equal(getReactionBonusCountFromTags([['reaction_bonus', 'oops']]), 0)
})

test('weighted reaction aggregation sums bonus weight and groups standard likes together', () => {
  const reactions = [
    { id: 'a', pubkey: '3'.repeat(64), created_at: 1, emoji: '+', bonusCount: 2 },
    { id: 'b', pubkey: '4'.repeat(64), created_at: 2, emoji: '❤️', bonusCount: 0 },
    { id: 'c', pubkey: '5'.repeat(64), created_at: 3, emoji: '😂', bonusCount: 1 }
  ]

  assert.equal(getWeightedReactionCount(reactions), 6)

  const summaries = summarizeReactions(reactions).map(({ key, weight }) => ({
    key,
    weight
  }))

  assert.deepEqual(summaries, [
    { key: '❤️', weight: 4 },
    { key: '😂', weight: 2 }
  ])
})

test('regular reaction drafts keep their existing content and omit reaction bonus tags', async () => {
  installTestWindow()
  const { createReactionDraftEvent } = await import('./draft-event.ts')
  const draft = createReactionDraftEvent(TARGET_EVENT, '❤️')

  assert.equal(draft.content, '❤️')
  assert.equal(draft.tags.some(([name]) => name === 'reaction_bonus'), false)
})
