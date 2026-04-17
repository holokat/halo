import storage from '@/services/local-storage.service'
import { TCustomFeed, TFeedInfo } from '@/types'

export const CUSTOM_FEEDS_CHANGED_EVENT = 'x21:custom-feeds-changed'
export const FEED_INFO_CHANGED_EVENT = 'x21:feed-info-changed'

export type TFeedInfoChangedDetail = {
  pubkey?: string | null
  feedInfo?: TFeedInfo
}

export function notifyCustomFeedsChanged() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(CUSTOM_FEEDS_CHANGED_EVENT))
}

export function notifyFeedInfoChanged(detail: TFeedInfoChangedDetail) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<TFeedInfoChangedDetail>(FEED_INFO_CHANGED_EVENT, { detail }))
}

export function upsertStoredCustomFeed(feed: TCustomFeed, pubkey?: string | null) {
  const existingFeed = storage
    .getCustomFeeds(pubkey)
    .find((currentFeed) => currentFeed.id === feed.id)

  if (existingFeed) {
    storage.updateCustomFeed(feed.id, feed, pubkey)
  } else {
    storage.addCustomFeed(feed, pubkey)
  }

  notifyCustomFeedsChanged()
}

export function persistStoredFeedInfo(feedInfo: TFeedInfo, pubkey?: string | null) {
  storage.setFeedInfo(feedInfo, pubkey)
  notifyFeedInfoChanged({ pubkey: pubkey ?? null, feedInfo })
}
