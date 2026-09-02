import { FEED_INFO_CHANGED_EVENT, TFeedInfoChangedDetail } from '@/lib/feed-sync'
import { getRelaySetFromEvent } from '@/lib/event-metadata'
import { normalizeVisibleFeedInfo } from '@/lib/feed-policy'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import { getPubkeysFromPTags } from '@/lib/tag'
import indexedDb from '@/services/indexed-db.service'
import storage from '@/services/local-storage.service'
import { TFeedInfo, TFeedType } from '@/types'
import { kinds } from 'nostr-tools'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useFavoriteRelays } from './FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'

type TFeedContext = {
  feedInfo: TFeedInfo
  relayUrls: string[]
  isReady: boolean
  switchFeed: (
    feedType: TFeedType,
    options?: {
      activeRelaySetId?: string
      pubkey?: string
      relay?: string | null
      customFeedId?: string
      persist?: boolean
    }
  ) => Promise<void>
}

const FeedContext = createContext<TFeedContext | undefined>(undefined)

export const useFeed = () => {
  const context = useContext(FeedContext)
  if (!context) {
    throw new Error('useFeed must be used within a FeedProvider')
  }
  return context
}

export const useOptionalFeed = () => {
  return useContext(FeedContext)
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const { pubkey, isInitialized, followListEvent } = useNostr()
  const { relaySets, favoriteRelays } = useFavoriteRelays()
  const [relayUrls, setRelayUrls] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)
  const [feedInfo, setFeedInfo] = useState<TFeedInfo>({
    feedType: 'trending'
  })
  const feedInfoRef = useRef<TFeedInfo>(feedInfo)

  useEffect(() => {
    const init = async () => {
      if (!isInitialized) {
        return
      }

      let nextFeedInfo: TFeedInfo
      let shouldPersistFeedInfo = true
      if (pubkey) {
        const storedFeedInfo = storage.getFeedInfo(pubkey)
        if (storedFeedInfo) {
          nextFeedInfo = normalizeVisibleFeedInfo(storedFeedInfo, pubkey)
          shouldPersistFeedInfo = false
        } else {
          const followings = followListEvent ? getPubkeysFromPTags(followListEvent.tags) : []
          nextFeedInfo = {
            feedType: followings.length > 0 ? 'following' : 'trending'
          }
        }
      } else {
        nextFeedInfo = { feedType: 'trending' }
      }

      if (nextFeedInfo.feedType === 'trending') {
        return await switchFeed('trending', { persist: shouldPersistFeedInfo })
      }

      if (nextFeedInfo.feedType === 'following' && pubkey) {
        return await switchFeed('following', { pubkey, persist: shouldPersistFeedInfo })
      }

      if (nextFeedInfo.feedType === 'bookmarks' && pubkey) {
        return await switchFeed('bookmarks', { pubkey, persist: shouldPersistFeedInfo })
      }
    }

    init()
  }, [pubkey, isInitialized, followListEvent])

  useEffect(() => {
    const handleFeedInfoChanged = (event: Event) => {
      const detail = (event as CustomEvent<TFeedInfoChangedDetail>).detail
      if (!pubkey) {
        return
      }

      if (detail?.pubkey && detail.pubkey !== pubkey) {
        return
      }

      const storedFeedInfo = detail?.feedInfo ?? storage.getFeedInfo(pubkey)
      if (!storedFeedInfo) {
        return
      }

      const nextFeedInfo = normalizeVisibleFeedInfo(storedFeedInfo, pubkey)

      if (nextFeedInfo.feedType === 'trending') {
        void switchFeed('trending', { persist: false })
        return
      }

      if (nextFeedInfo.feedType === 'following') {
        void switchFeed('following', { pubkey, persist: false })
        return
      }

      if (nextFeedInfo.feedType === 'bookmarks') {
        void switchFeed('bookmarks', { pubkey, persist: false })
        return
      }
    }

    window.addEventListener(FEED_INFO_CHANGED_EVENT, handleFeedInfoChanged)

    return () => {
      window.removeEventListener(FEED_INFO_CHANGED_EVENT, handleFeedInfoChanged)
    }
  }, [pubkey, relaySets, favoriteRelays])

  const switchFeed = async (
    feedType: TFeedType,
    options: {
      activeRelaySetId?: string | null
      pubkey?: string | null
      relay?: string | null
      customFeedId?: string | null
      persist?: boolean
    } = {}
  ) => {
    setIsReady(false)

    const applyFeedInfo = (newFeedInfo: TFeedInfo) => {
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      if (options.persist !== false) {
        storage.setFeedInfo(newFeedInfo, pubkey)
      }
    }

    if (feedType === 'relay') {
      const normalizedUrl = normalizeUrl(options.relay ?? '')
      if (!normalizedUrl || !isWebsocketUrl(normalizedUrl)) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType, id: normalizedUrl }
      applyFeedInfo(newFeedInfo)
      setRelayUrls([normalizedUrl])
      setIsReady(true)
      return
    }
    if (feedType === 'relays') {
      const relaySetId = options.activeRelaySetId ?? (relaySets.length > 0 ? relaySets[0].id : null)
      if (!relaySetId || !pubkey) {
        setIsReady(true)
        return
      }

      let relaySet =
        relaySets.find((set) => set.id === relaySetId) ??
        (relaySets.length > 0 ? relaySets[0] : null)
      if (!relaySet) {
        const storedRelaySetEvent = await indexedDb.getReplaceableEvent(
          pubkey,
          kinds.Relaysets,
          relaySetId
        )
        if (storedRelaySetEvent) {
          relaySet = getRelaySetFromEvent(storedRelaySetEvent)
        }
      }
      if (relaySet) {
        const newFeedInfo = { feedType, id: relaySet.id }
        applyFeedInfo(newFeedInfo)
        setRelayUrls(relaySet.relayUrls)
        setIsReady(true)
      }
      setIsReady(true)
      return
    }
    if (feedType === 'following') {
      if (!options.pubkey) {
        setIsReady(true)
        return
      }
      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'trending') {
      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'news') {
      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'bookmarks') {
      if (!options.pubkey) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'custom') {
      if (!options.customFeedId) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType, id: options.customFeedId }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'one-per-person') {
      if (!options.pubkey) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'polls') {
      if (!options.pubkey) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType }
      applyFeedInfo(newFeedInfo)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    setIsReady(true)
  }

  return (
    <FeedContext.Provider
      value={{
        feedInfo,
        relayUrls,
        isReady,
        switchFeed
      }}
    >
      {children}
    </FeedContext.Provider>
  )
}
