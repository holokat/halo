import { TCustomFeed, TFeedSubRequest } from '@/types'

export const INTERESTS_FEED_ID = 'interests'

export type TInterestCategoryId =
  | 'news'
  | 'sports'
  | 'entertainment'
  | 'finance'
  | 'business'
  | 'politics'
  | 'science'
  | 'space'
  | 'outdoors'
  | 'gaming'
  | 'animals'
  | 'technology'
  | 'travel'
  | 'food'
  | 'music'
  | 'health'

export type TInterestCategory = {
  id: TInterestCategoryId
  label: string
  icon: string
  hashtags: string[]
}

export const INTEREST_CATEGORIES: TInterestCategory[] = [
  { id: 'news', label: 'News', icon: 'Newspaper', hashtags: ['news', 'breakingnews'] },
  { id: 'sports', label: 'Sports', icon: 'Trophy', hashtags: ['sports', 'sportstr'] },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: 'Clapperboard',
    hashtags: ['entertainment', 'movies', 'tv']
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'ChartCandlestick',
    hashtags: ['finance', 'investing', 'markets']
  },
  {
    id: 'business',
    label: 'Business',
    icon: 'BriefcaseBusiness',
    hashtags: ['business', 'startups', 'entrepreneurship']
  },
  { id: 'politics', label: 'Politics', icon: 'Landmark', hashtags: ['politics'] },
  { id: 'science', label: 'Science', icon: 'FlaskConical', hashtags: ['science'] },
  { id: 'space', label: 'Space', icon: 'Rocket', hashtags: ['space', 'astronomy'] },
  {
    id: 'outdoors',
    label: 'Outdoors',
    icon: 'Trees',
    hashtags: ['outdoors', 'hiking', 'camping']
  },
  { id: 'gaming', label: 'Gaming', icon: 'Gamepad2', hashtags: ['gaming', 'gamedev'] },
  { id: 'animals', label: 'Animals', icon: 'PawPrint', hashtags: ['animals', 'pets'] },
  { id: 'technology', label: 'Technology', icon: 'Cpu', hashtags: ['technology', 'tech'] },
  { id: 'travel', label: 'Travel', icon: 'Plane', hashtags: ['travel'] },
  { id: 'food', label: 'Food', icon: 'UtensilsCrossed', hashtags: ['food', 'cooking'] },
  { id: 'music', label: 'Music', icon: 'Music4', hashtags: ['music', 'musicstr'] },
  { id: 'health', label: 'Health', icon: 'HeartPulse', hashtags: ['health', 'fitness'] }
]

export function normalizeCustomFeedHashtag(value: string) {
  return value
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function dedupeCustomFeedHashtags(values: string[]) {
  const unique = new Set<string>()

  values.forEach((value) => {
    const normalized = normalizeCustomFeedHashtag(value)
    if (normalized) {
      unique.add(normalized)
    }
  })

  return [...unique]
}

export function buildInterestsFeedHashtags(selectedInterestIds: TInterestCategoryId[]) {
  return dedupeCustomFeedHashtags(
    INTEREST_CATEGORIES.filter((interest) => selectedInterestIds.includes(interest.id)).flatMap(
      (interest) => interest.hashtags
    )
  )
}

export function getCustomFeedHashtags(feed: TCustomFeed) {
  if (feed.hashtags?.length) {
    return dedupeCustomFeedHashtags(feed.hashtags)
  }

  if (feed.searchParams.type === 'hashtag') {
    return dedupeCustomFeedHashtags([feed.searchParams.search])
  }

  return []
}

export function buildHashtagFeedSubRequests(
  hashtags: string[],
  urls: string[]
): TFeedSubRequest[] {
  return dedupeCustomFeedHashtags(hashtags).map((hashtag) => ({
    urls,
    filter: { '#t': [hashtag] }
  }))
}

export function shouldBypassTrustFilterForCustomFeed(feedId: string) {
  return feedId === INTERESTS_FEED_ID
}

export function shouldBypassHashtagLimitForCustomFeed(feedId: string) {
  return feedId === INTERESTS_FEED_ID
}

export function createInterestsCustomFeed(hashtags: string[]): TCustomFeed {
  const normalizedHashtags = dedupeCustomFeedHashtags(hashtags)

  return {
    id: INTERESTS_FEED_ID,
    name: 'Interests',
    hashtags: normalizedHashtags,
    searchParams: {
      type: 'hashtag',
      search: normalizedHashtags[0] || 'interests',
      input: normalizedHashtags.map((hashtag) => `#${hashtag}`).join(' ')
    }
  }
}
