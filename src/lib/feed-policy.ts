import { type TFeedInfo } from '@/types'

export function normalizeVisibleFeedInfo(feedInfo: TFeedInfo, pubkey?: string | null): TFeedInfo {
  if (feedInfo.feedType === 'trending') return { feedType: 'trending' }
  if (pubkey && feedInfo.feedType === 'following') return { feedType: 'following' }
  if (pubkey && feedInfo.feedType === 'bookmarks') return { feedType: 'bookmarks' }
  return { feedType: 'trending' }
}
