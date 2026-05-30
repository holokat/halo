import { ExtendedKind } from '@/constants'
import { kinds } from 'nostr-tools'

export const INDEXED_DB_NAME = 'jumble'
export const INDEXED_DB_VERSION = 15

export const StoreNames = {
  PROFILE_EVENTS: 'profileEvents',
  RELAY_LIST_EVENTS: 'relayListEvents',
  INBOX_RELAY_LIST_EVENTS: 'inboxRelayListEvents',
  FOLLOW_LIST_EVENTS: 'followListEvents',
  MUTE_LIST_EVENTS: 'muteListEvents',
  BOOKMARK_LIST_EVENTS: 'bookmarkListEvents',
  BLOSSOM_SERVER_LIST_EVENTS: 'blossomServerListEvents',
  MUTE_DECRYPTED_TAGS: 'muteDecryptedTags',
  USER_EMOJI_LIST_EVENTS: 'userEmojiListEvents',
  EMOJI_SET_EVENTS: 'emojiSetEvents',
  PIN_LIST_EVENTS: 'pinListEvents',
  FAVORITE_RELAYS: 'favoriteRelays',
  RELAY_SETS: 'relaySets',
  FOLLOWING_FAVORITE_RELAYS: 'followingFavoriteRelays',
  RELAY_INFOS: 'relayInfos',
  RELAY_INFO_EVENTS: 'relayInfoEvents', // deprecated
  GIF_CACHE: 'gifCache',
  NOTE_STATS: 'noteStats',
  NOTE_STATS_INTERACTION_META: 'noteStatsInteractionMeta',
  LAST_ACTIVITY: 'lastActivity',
  RECENT_FEEDS: 'recentFeeds'
} as const

export type TStoreName = (typeof StoreNames)[keyof typeof StoreNames]

export type TIndexedDbRecord<T = unknown> = {
  key: string
  value: T | null
  addedAt: number
}

type TStoreSchema = {
  name: TStoreName
  keyPath: string
  indexes?: { name: string; keyPath: string; options?: IDBIndexParameters }[]
}

const STORE_SCHEMAS: TStoreSchema[] = [
  { name: StoreNames.PROFILE_EVENTS, keyPath: 'key' },
  { name: StoreNames.RELAY_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.INBOX_RELAY_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.FOLLOW_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.MUTE_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.BOOKMARK_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.MUTE_DECRYPTED_TAGS, keyPath: 'key' },
  { name: StoreNames.FAVORITE_RELAYS, keyPath: 'key' },
  { name: StoreNames.RELAY_SETS, keyPath: 'key' },
  { name: StoreNames.FOLLOWING_FAVORITE_RELAYS, keyPath: 'key' },
  { name: StoreNames.BLOSSOM_SERVER_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.USER_EMOJI_LIST_EVENTS, keyPath: 'key' },
  { name: StoreNames.EMOJI_SET_EVENTS, keyPath: 'key' },
  { name: StoreNames.RELAY_INFOS, keyPath: 'key' },
  { name: StoreNames.PIN_LIST_EVENTS, keyPath: 'key' },
  {
    name: StoreNames.GIF_CACHE,
    keyPath: 'eventId',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt' }]
  },
  {
    name: StoreNames.NOTE_STATS,
    keyPath: 'key',
    indexes: [{ name: 'addedAt', keyPath: 'addedAt' }]
  },
  {
    name: StoreNames.NOTE_STATS_INTERACTION_META,
    keyPath: 'key',
    indexes: [{ name: 'addedAt', keyPath: 'addedAt' }]
  },
  {
    name: StoreNames.LAST_ACTIVITY,
    keyPath: 'key',
    indexes: [{ name: 'addedAt', keyPath: 'addedAt' }]
  },
  {
    name: StoreNames.RECENT_FEEDS,
    keyPath: 'key',
    indexes: [{ name: 'addedAt', keyPath: 'addedAt' }]
  }
]

export function applyIndexedDbSchema(db: IDBDatabase) {
  STORE_SCHEMAS.forEach(({ name, keyPath, indexes }) => {
    if (db.objectStoreNames.contains(name)) {
      return
    }

    const store = db.createObjectStore(name, { keyPath })
    indexes?.forEach(({ name: indexName, keyPath: indexKeyPath, options }) => {
      store.createIndex(indexName, indexKeyPath, options ?? { unique: false })
    })
  })

  if (db.objectStoreNames.contains(StoreNames.RELAY_INFO_EVENTS)) {
    db.deleteObjectStore(StoreNames.RELAY_INFO_EVENTS)
  }
}

export function getStoreNameByKind(kind: number): TStoreName | undefined {
  switch (kind) {
    case kinds.Metadata:
      return StoreNames.PROFILE_EVENTS
    case kinds.RelayList:
      return StoreNames.RELAY_LIST_EVENTS
    case ExtendedKind.INBOX_RELAYS:
      return StoreNames.INBOX_RELAY_LIST_EVENTS
    case kinds.Contacts:
      return StoreNames.FOLLOW_LIST_EVENTS
    case kinds.Mutelist:
      return StoreNames.MUTE_LIST_EVENTS
    case ExtendedKind.BLOSSOM_SERVER_LIST:
      return StoreNames.BLOSSOM_SERVER_LIST_EVENTS
    case kinds.Relaysets:
      return StoreNames.RELAY_SETS
    case ExtendedKind.FAVORITE_RELAYS:
      return StoreNames.FAVORITE_RELAYS
    case kinds.BookmarkList:
      return StoreNames.BOOKMARK_LIST_EVENTS
    case kinds.UserEmojiList:
      return StoreNames.USER_EMOJI_LIST_EVENTS
    case kinds.Emojisets:
      return StoreNames.EMOJI_SET_EVENTS
    case kinds.Pinlist:
      return StoreNames.PIN_LIST_EVENTS
    default:
      return undefined
  }
}
