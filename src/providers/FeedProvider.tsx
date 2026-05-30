import { getCustomFeedHashtags, INTERESTS_FEED_ID } from '@/lib/custom-feed'
import { FEED_INFO_CHANGED_EVENT, TFeedInfoChangedDetail } from '@/lib/feed-sync'
import { getRelaySetFromEvent } from '@/lib/event-metadata'
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
    feedType: 'news'
  })
  const feedInfoRef = useRef<TFeedInfo>(feedInfo)

  useEffect(() => {
    const init = async () => {
      if (!isInitialized) {
        return
      }

      let feedInfo: TFeedInfo
      if (pubkey) {
        // For logged in users, check stored feed or default based on follow list
        const storedFeedInfo = storage.getFeedInfo(pubkey)
        if (storedFeedInfo) {
          feedInfo = storedFeedInfo
        } else {
          const interestsFeed = storage
            .getCustomFeeds(pubkey)
            .find((feed) => feed.id === INTERESTS_FEED_ID && getCustomFeedHashtags(feed).length > 0)

          if (interestsFeed) {
            feedInfo = { feedType: 'custom', id: interestsFeed.id }
            return await switchFeed('custom', { customFeedId: interestsFeed.id })
          }

          // Check if user has any followings
          const followings = followListEvent ? getPubkeysFromPTags(followListEvent.tags) : []

          if (followings.length === 0) {
            feedInfo = { feedType: 'news' }
            return await switchFeed('news')
          } else {
            // Users with followings default to following feed
            feedInfo = { feedType: 'following' }
            return await switchFeed('following', { pubkey })
          }
        }
      } else {
        feedInfo = { feedType: 'news' }
      }

      if (feedInfo.feedType === 'relays') {
        return await switchFeed('relays', { activeRelaySetId: feedInfo.id })
      }

      if (feedInfo.feedType === 'relay') {
        return await switchFeed('relay', { relay: feedInfo.id })
      }

      if (feedInfo.feedType === 'trending') {
        return await switchFeed('trending')
      }

      if (feedInfo.feedType === 'news') {
        return await switchFeed('news')
      }

      // update following feed if pubkey changes
      if (feedInfo.feedType === 'following' && pubkey) {
        return await switchFeed('following', { pubkey })
      }

      if (feedInfo.feedType === 'bookmarks' && pubkey) {
        return await switchFeed('bookmarks', { pubkey })
      }

      if (feedInfo.feedType === 'custom') {
        return await switchFeed('custom', { customFeedId: feedInfo.id })
      }

      if (feedInfo.feedType === 'one-per-person' && pubkey) {
        return await switchFeed('one-per-person', { pubkey })
      }

      if (feedInfo.feedType === 'polls' && pubkey) {
        return await switchFeed('polls', { pubkey })
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

      const nextFeedInfo = detail?.feedInfo ?? storage.getFeedInfo(pubkey)
      if (!nextFeedInfo) {
        return
      }

      if (nextFeedInfo.feedType === 'relays') {
        void switchFeed('relays', { activeRelaySetId: nextFeedInfo.id })
        return
      }

      if (nextFeedInfo.feedType === 'relay') {
        void switchFeed('relay', { relay: nextFeedInfo.id })
        return
      }

      if (nextFeedInfo.feedType === 'trending') {
        void switchFeed('trending')
        return
      }

      if (nextFeedInfo.feedType === 'news') {
        void switchFeed('news')
        return
      }

      if (nextFeedInfo.feedType === 'following') {
        void switchFeed('following', { pubkey })
        return
      }

      if (nextFeedInfo.feedType === 'bookmarks') {
        void switchFeed('bookmarks', { pubkey })
        return
      }

      if (nextFeedInfo.feedType === 'custom') {
        void switchFeed('custom', { customFeedId: nextFeedInfo.id })
        return
      }

      if (nextFeedInfo.feedType === 'one-per-person') {
        void switchFeed('one-per-person', { pubkey })
        return
      }

      if (nextFeedInfo.feedType === 'polls') {
        void switchFeed('polls', { pubkey })
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
    } = {}
  ) => {
    setIsReady(false)
    if (feedType === 'relay') {
      const normalizedUrl = normalizeUrl(options.relay ?? '')
      if (!normalizedUrl || !isWebsocketUrl(normalizedUrl)) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType, id: normalizedUrl }
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      setRelayUrls([normalizedUrl])
      storage.setFeedInfo(newFeedInfo, pubkey)
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
        setFeedInfo(newFeedInfo)
        feedInfoRef.current = newFeedInfo
        setRelayUrls(relaySet.relayUrls)
        storage.setFeedInfo(newFeedInfo, pubkey)
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
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'trending') {
      const newFeedInfo = { feedType }
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    if (feedType === 'news') {
      const newFeedInfo = { feedType }
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

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
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

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
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

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
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

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
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

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
