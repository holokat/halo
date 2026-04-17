import { tagNameEquals } from '@/lib/tag'
import { TRelayInfo } from '@/types'
import { Event, kinds } from 'nostr-tools'
import {
  applyIndexedDbSchema,
  getStoreNameByKind,
  INDEXED_DB_NAME,
  INDEXED_DB_VERSION,
  StoreNames,
  type TIndexedDbRecord
} from './indexed-db/schema'
import {
  abortTransaction,
  commitTransaction,
  openIndexedDbStore,
  readAllStoredValues,
  readStoredValue,
  requestPromise
} from './indexed-db/transactions'

class IndexedDbService {
  static instance: IndexedDbService
  static getInstance(): IndexedDbService {
    if (!IndexedDbService.instance) {
      IndexedDbService.instance = new IndexedDbService()
      IndexedDbService.instance.init()
    }
    return IndexedDbService.instance
  }

  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION)

        request.onerror = (event) => {
          reject(event)
        }

        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }

        request.onupgradeneeded = () => {
          const db = request.result
          applyIndexedDbSchema(db)
          this.db = db
        }
      })
      const cleanupTimer = setTimeout(() => this.cleanUp(), 1000 * 60) // 1 minute
      cleanupTimer.unref?.()
    }
    return this.initPromise
  }

  private async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T> | T
  ): Promise<T> {
    await this.init()
    if (!this.db) {
      throw new Error('database not initialized')
    }

    const { transaction, store } = openIndexedDbStore(this.db, storeName, mode)

    try {
      const result = await work(store, transaction)
      commitTransaction(transaction)
      return result
    } catch (error) {
      abortTransaction(transaction)
      throw error
    }
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.init()
    if (!this.db) {
      throw new Error('database not initialized')
    }
    return this.db
  }

  private async readRecordValue<T>(storeName: string, key: IDBValidKey) {
    return this.withStore(storeName, 'readonly', async (store) => {
      const record = await requestPromise<TIndexedDbRecord<T> | undefined>(store.get(key))
      return record?.value ?? null
    })
  }

  private async writeRecordValue<T>(storeName: string, key: IDBValidKey, value: T): Promise<void> {
    return this.withStore(storeName, 'readwrite', async (store) => {
      await requestPromise(store.put({ key: String(key), value, addedAt: Date.now() }))
    })
  }

  private async deleteRecordValue(storeName: string, key: IDBValidKey): Promise<void> {
    return this.withStore(storeName, 'readwrite', async (store) => {
      await requestPromise(store.delete(key))
    })
  }

  private async readManyRecordValues<T>(
    storeName: string,
    keys: readonly string[]
  ): Promise<(T | null)[]> {
    return this.withStore(storeName, 'readonly', async (store) => {
      return Promise.all(
        keys.map(async (key) => {
          const record = await requestPromise<TIndexedDbRecord<T> | undefined>(store.get(key))
          return record?.value ?? null
        })
      )
    })
  }

  private async writeManyRecordValues<T>(
    storeName: string,
    entries: { key: string; value: T }[]
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this.withStore(storeName, 'readwrite', async (store) => {
      await Promise.all(
        entries.map(({ key, value }) =>
          requestPromise(store.put({ key, value, addedAt: Date.now() }))
        )
      )
    })
  }

  async putNullReplaceableEvent(pubkey: string, kind: number, d?: string) {
    const storeName = getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    return this.withStore(storeName, 'readwrite', async (store) => {
      const key = this.getReplaceableEventKey(pubkey, d)
      const oldValue = await requestPromise<TIndexedDbRecord<Event> | undefined>(store.get(key))
      if (oldValue) {
        return oldValue.value
      }
      await requestPromise(store.put({ key, value: null, addedAt: Date.now() }))
      return null
    })
  }

  async putReplaceableEvent(event: Event): Promise<Event> {
    const storeName = getStoreNameByKind(event.kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    return this.withStore(storeName, 'readwrite', async (store) => {
      const key = this.getReplaceableEventKeyFromEvent(event)
      const oldValue = await requestPromise<TIndexedDbRecord<Event> | undefined>(store.get(key))
      if (oldValue?.value && oldValue.value.created_at >= event.created_at) {
        return oldValue.value
      }
      await requestPromise(store.put({ key, value: event, addedAt: Date.now() }))
      return event
    })
  }

  async getReplaceableEvent(
    pubkey: string,
    kind: number,
    d?: string
  ): Promise<Event | undefined | null> {
    const storeName = getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    const key = this.getReplaceableEventKey(pubkey, d)
    return this.withStore(storeName, 'readonly', async (store) => {
      const record = await requestPromise<TIndexedDbRecord<Event | null> | undefined>(store.get(key))
      if (!record) {
        return undefined
      }
      return record.value
    })
  }

  async getReplaceableEventByCoordinate(coordinate: string): Promise<Event | undefined | null> {
    const [kind, pubkey, ...rest] = coordinate.split(':')
    if (!kind || !pubkey) return undefined
    const d = rest.length > 0 ? rest.join(':') : undefined
    return this.getReplaceableEvent(pubkey, parseInt(kind, 10), d)
  }

  async deleteReplaceableEvent(pubkey: string, kind: number, d?: string): Promise<void> {
    const storeName = getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    const key = this.getReplaceableEventKey(pubkey, d)
    return this.deleteRecordValue(storeName, key)
  }

  async getManyReplaceableEvents(
    pubkeys: readonly string[],
    kind: number
  ): Promise<(Event | undefined | null)[]> {
    const storeName = getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    return this.withStore(storeName, 'readonly', async (store) => {
      return Promise.all(
        pubkeys.map(async (pubkey) => {
          const key = this.getReplaceableEventKey(pubkey)
          const record = await requestPromise<TIndexedDbRecord<Event | null> | undefined>(store.get(key))
          if (!record) {
            return undefined
          }
          return record.value
        })
      )
    })
  }

  async getMuteDecryptedTags(id: string): Promise<string[][] | null> {
    return this.readRecordValue<string[][]>(StoreNames.MUTE_DECRYPTED_TAGS, id)
  }

  async putMuteDecryptedTags(id: string, tags: string[][]): Promise<void> {
    return this.writeRecordValue(StoreNames.MUTE_DECRYPTED_TAGS, id, tags)
  }

  async iterateProfileEvents(callback: (event: Event) => Promise<void>): Promise<void> {
    return this.withStore(StoreNames.PROFILE_EVENTS, 'readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor()
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
          if (cursor) {
            const value = (cursor.value as TIndexedDbRecord<Event>).value
            if (value) {
              void callback(value)
            }
            cursor.continue()
          } else {
            resolve()
          }
        }

        request.onerror = (event) => reject(event)
      })
    })
  }

  async putFollowingFavoriteRelays(pubkey: string, relays: [string, string[]][]): Promise<void> {
    return this.writeRecordValue(StoreNames.FOLLOWING_FAVORITE_RELAYS, pubkey, relays)
  }

  async getFollowingFavoriteRelays(pubkey: string): Promise<[string, string[]][] | null> {
    return this.readRecordValue<[string, string[]][]>(StoreNames.FOLLOWING_FAVORITE_RELAYS, pubkey)
  }

  async putRelayInfo(relayInfo: TRelayInfo): Promise<void> {
    return this.writeRecordValue(StoreNames.RELAY_INFOS, relayInfo.url, relayInfo)
  }

  async getRelayInfo(url: string): Promise<TRelayInfo | null> {
    return this.readRecordValue<TRelayInfo>(StoreNames.RELAY_INFOS, url)
  }

  private getReplaceableEventKeyFromEvent(event: Event): string {
    if (
      [kinds.Metadata, kinds.Contacts].includes(event.kind) ||
      (event.kind >= 10000 && event.kind < 20000)
    ) {
      return this.getReplaceableEventKey(event.pubkey)
    }

    const [, d] = event.tags.find(tagNameEquals('d')) ?? []
    return this.getReplaceableEventKey(event.pubkey, d)
  }

  private getReplaceableEventKey(pubkey: string, d?: string): string {
    return d === undefined ? pubkey : `${pubkey}:${d}`
  }

  // GIF cache methods
  async putGif(gif: any): Promise<void> {
    return this.withStore(StoreNames.GIF_CACHE, 'readwrite', async (store) => {
      await requestPromise(store.put(gif))
    })
  }

  async putManyGifs(gifs: any[]): Promise<void> {
    if (gifs.length === 0) return
    await this.withStore(StoreNames.GIF_CACHE, 'readwrite', async (store) => {
      await Promise.all(gifs.map((gif) => requestPromise(store.put(gif))))
    })
  }

  async getAllGifs(): Promise<any[]> {
    return this.withStore(StoreNames.GIF_CACHE, 'readonly', async (store) => {
      return requestPromise<any[]>(store.getAll()).then((result) => result || [])
    })
  }

  async getGifCount(): Promise<number> {
    return this.withStore(StoreNames.GIF_CACHE, 'readonly', async (store) => {
      return requestPromise<number>(store.count())
    })
  }

  async clearGifCache(): Promise<void> {
    return this.withStore(StoreNames.GIF_CACHE, 'readwrite', async (store) => {
      await requestPromise(store.clear())
    })
  }

  private async cleanUp() {
    await this.initPromise
    if (!this.db) {
      return
    }

    const stores = [
      { name: StoreNames.PROFILE_EVENTS, expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 }, // 1 day
      { name: StoreNames.RELAY_LIST_EVENTS, expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 }, // 1 day
      { name: StoreNames.INBOX_RELAY_LIST_EVENTS, expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 }, // 1 day
      {
        name: StoreNames.FOLLOW_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 day
      },
      {
        name: StoreNames.BLOSSOM_SERVER_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 days
      },
      {
        name: StoreNames.RELAY_INFOS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 days
      },
      {
        name: StoreNames.PIN_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 30 // 30 days
      },
      {
        name: StoreNames.NOTE_STATS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 7 // 7 days
      },
      {
        name: StoreNames.NOTE_STATS_INTERACTION_META,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 7 // 7 days
      },
      {
        name: StoreNames.LAST_ACTIVITY,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 3 // 3 days
      },
      {
        name: StoreNames.RECENT_FEEDS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 6 // 6 hours
      }
    ]
    const transaction = this.db!.transaction(
      stores.map((store) => store.name),
      'readwrite'
    )
    await Promise.allSettled(
      stores.map(({ name, expirationTimestamp }) => {
        if (expirationTimestamp < 0) {
          return Promise.resolve()
        }
        return new Promise<void>((resolve, reject) => {
          const store = transaction.objectStore(name)
          const request = store.openCursor()
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result
            if (cursor) {
              const value: TIndexedDbRecord = cursor.value
              if (value.addedAt < expirationTimestamp) {
                cursor.delete()
              }
              cursor.continue()
            } else {
              resolve()
            }
          }

          request.onerror = (event) => {
            reject(event)
          }
        })
      })
    )
  }

  async putTranslatedEvent(eventId: string, targetLanguage: string, translatedEvent: Event) {
    return this.writeRecordValue(
      StoreNames.TRANSLATED_EVENTS,
      `${targetLanguage}_${eventId}`,
      translatedEvent
    )
  }

  async getTranslatedEvent(eventId: string, targetLanguage: string): Promise<Event | null> {
    return this.readRecordValue<Event>(StoreNames.TRANSLATED_EVENTS, `${targetLanguage}_${eventId}`)
  }

  async getAllTranslatedEvents(): Promise<Map<string, Event>> {
    const results = await readAllStoredValues<Event>(await this.getDb(), StoreNames.TRANSLATED_EVENTS)
    const map = new Map<string, Event>()
    results.forEach((item) => {
      if (item.value) {
        map.set(item.key, item.value)
      }
    })
    return map
  }

  async clearOldTranslatedEvents(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000) {
    const expirationTimestamp = Date.now() - maxAgeMs

    return this.withStore(StoreNames.TRANSLATED_EVENTS, 'readwrite', async (store) => {
      const index = store.index('addedAt')
      const range = IDBKeyRange.upperBound(expirationTimestamp)
      await new Promise<void>((resolve, reject) => {
        const request = index.openCursor(range)
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
          if (cursor) {
            cursor.delete()
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = (event) => reject(event)
      })
    })
  }

  async getNoteStats(eventId: string): Promise<Record<string, any> | null> {
    return this.readRecordValue<Record<string, any>>(StoreNames.NOTE_STATS, eventId)
  }

  async getManyNoteStats(eventIds: readonly string[]): Promise<Map<string, Record<string, any>>> {
    if (eventIds.length === 0) return new Map()

    const values = await this.readManyRecordValues<Record<string, any>>(
      StoreNames.NOTE_STATS,
      eventIds as string[]
    )
    const map = new Map<string, Record<string, any>>()
    values.forEach((value, index) => {
      if (value) {
        map.set(eventIds[index], value)
      }
    })
    return map
  }

  async putNoteStats(eventId: string, noteStats: Record<string, any>): Promise<void> {
    return this.writeRecordValue(StoreNames.NOTE_STATS, eventId, noteStats)
  }

  async putManyNoteStats(entries: { eventId: string; noteStats: Record<string, any> }[]): Promise<void> {
    return this.writeManyRecordValues(
      StoreNames.NOTE_STATS,
      entries.map(({ eventId, noteStats }) => ({ key: eventId, value: noteStats }))
    )
  }

  async getRecentFeed(key: string): Promise<Event[] | null> {
    return this.readRecordValue<Event[]>(StoreNames.RECENT_FEEDS, key)
  }

  async putRecentFeed(key: string, events: Event[]): Promise<void> {
    return this.writeRecordValue(StoreNames.RECENT_FEEDS, key, events)
  }

  async getManyLastActivity(
    pubkeys: readonly string[]
  ): Promise<Map<string, { lastPostTimestamp: number | null; checkedAt: number }>> {
    if (pubkeys.length === 0) return new Map()

    const values = await this.readManyRecordValues<{
      lastPostTimestamp: number | null
      checkedAt: number
    }>(StoreNames.LAST_ACTIVITY, pubkeys as string[])
    const result = new Map<string, { lastPostTimestamp: number | null; checkedAt: number }>()
    values.forEach((value, index) => {
      if (value) {
        result.set(pubkeys[index], value)
      }
    })
    return result
  }

  async putManyLastActivity(
    entries: { pubkey: string; lastPostTimestamp: number | null; checkedAt: number }[]
  ): Promise<void> {
    return this.writeManyRecordValues(
      StoreNames.LAST_ACTIVITY,
      entries.map(({ pubkey, lastPostTimestamp, checkedAt }) => ({
        key: pubkey,
        value: { lastPostTimestamp, checkedAt }
      }))
    )
  }
}

const instance = IndexedDbService.getInstance()
export default instance
