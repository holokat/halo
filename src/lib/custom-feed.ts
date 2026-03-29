import { BIG_RELAY_URLS, SEARCHABLE_RELAY_URLS } from '@/constants'
import { TCustomFeed, TFeedSubRequest } from '@/types'
import { buildHashtagFeedSubRequests, getCustomFeedHashtags } from './interests-feed'

export {
  buildInterestsFeedHashtags,
  createInterestsCustomFeed,
  dedupeCustomFeedHashtags,
  getCustomFeedHashtags,
  INTEREST_CATEGORIES,
  INTERESTS_FEED_ID,
  normalizeCustomFeedHashtag,
  shouldBypassHashtagLimitForCustomFeed,
  shouldBypassTrustFilterForCustomFeed
} from './interests-feed'
export type { TInterestCategory, TInterestCategoryId } from './interests-feed'

export function getCustomFeedSubRequests(feed: TCustomFeed): TFeedSubRequest[] {
  if (feed.searchParams.type === 'notes') {
    return [{ urls: SEARCHABLE_RELAY_URLS, filter: { search: feed.searchParams.search } }]
  }

  const hashtags = getCustomFeedHashtags(feed)
  if (hashtags.length > 0) {
    return buildHashtagFeedSubRequests(hashtags, BIG_RELAY_URLS)
  }

  return []
}
