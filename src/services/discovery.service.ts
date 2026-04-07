import { DISCOVERY_API_BASE_URL, DISCOVERY_API_ENABLED } from '@/constants'
import { pubkeyToNpub } from '@/lib/pubkey'
import { TProfile } from '@/types'
import { Event as NostrEvent } from 'nostr-tools'

type TDiscoveryProfile = {
  pubkey: string
  name?: string | null
  display_name?: string | null
  nip05?: string | null
  about?: string | null
  picture?: string | null
}

type TDiscoveryProfileSearchResponse = {
  profiles?: TDiscoveryProfile[]
}

type TDiscoveryProfileSuggestResponse = {
  suggestions?: TDiscoveryProfile[]
}

type TDiscoveryTrendingNoteEntry = {
  event?: NostrEvent
}

type TDiscoveryTrendingNotesResponse = {
  notes?: Array<TDiscoveryTrendingNoteEntry | NostrEvent>
}

export type TTrendingUser = {
  pubkey: string
  newFollowers: number
}

type TDiscoveryTrendingUsersResponse = {
  users?: Array<{
    pubkey: string
    new_followers: number
  }>
}

export type TTrendingHashtag = {
  hashtag: string
  count: number
}

type TDiscoveryTrendingHashtagsResponse = {
  hashtags?: TTrendingHashtag[]
}

const REQUEST_TIMEOUT_MS = 3500

function isNostrEvent(event: unknown): event is NostrEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'id' in event &&
    typeof (event as { id?: unknown }).id === 'string'
  )
}

function mapDiscoveryProfileToProfile(profile: TDiscoveryProfile): TProfile | null {
  const npub = pubkeyToNpub(profile.pubkey)
  if (!npub) {
    return null
  }

  const displayName = profile.display_name?.trim()
  const username = profile.name?.trim()
  const fallbackName = npub.slice(0, 12)

  return {
    username: displayName || username || fallbackName,
    original_username: username || displayName || fallbackName,
    pubkey: profile.pubkey,
    npub,
    avatar: profile.picture ?? undefined,
    nip05: profile.nip05 ?? undefined,
    about: profile.about ?? undefined
  }
}

class DiscoveryService {
  static instance: DiscoveryService

  constructor() {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = this
    }
    return DiscoveryService.instance
  }

  isEnabled() {
    return DISCOVERY_API_ENABLED
  }

  private buildUrl(path: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(path, DISCOVERY_API_BASE_URL)

    if (!searchParams) {
      return url.toString()
    }

    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return
      }

      url.searchParams.set(key, String(value))
    })

    return url.toString()
  }

  private async fetchJson<T>(
    path: string,
    searchParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    if (!this.isEnabled()) {
      throw new Error('Discovery API disabled')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(this.buildUrl(path, searchParams), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Discovery request failed')
      }

      return data as T
    } finally {
      clearTimeout(timeout)
    }
  }

  async suggestProfiles(query: string, limit: number): Promise<TProfile[]> {
    if (!this.isEnabled()) {
      return []
    }

    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      return []
    }

    const data = await this.fetchJson<TDiscoveryProfileSuggestResponse>('/v1/search/suggest', {
      q: normalizedQuery,
      limit: Math.min(limit, 10)
    })

    return (data.suggestions ?? [])
      .map(mapDiscoveryProfileToProfile)
      .filter((profile): profile is TProfile => profile !== null)
  }

  async searchProfiles(query: string, limit: number, offset: number = 0): Promise<TProfile[]> {
    if (!this.isEnabled()) {
      return []
    }

    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return []
    }

    const data = await this.fetchJson<TDiscoveryProfileSearchResponse>('/v1/search', {
      q: normalizedQuery,
      type: 'profiles',
      limit: Math.min(limit, 100),
      offset
    })

    return (data.profiles ?? [])
      .map(mapDiscoveryProfileToProfile)
      .filter((profile): profile is TProfile => profile !== null)
  }

  async fetchTrendingNotes(limit: number = 20): Promise<NostrEvent[]> {
    if (!this.isEnabled()) {
      return []
    }

    const data = await this.fetchJson<TDiscoveryTrendingNotesResponse>('/v1/notes/trending', {
      limit: Math.min(limit, 100)
    })

    return (data.notes ?? [])
      .map((entry) => {
        if ('event' in entry) {
          return entry.event ?? null
        }

        return entry
      })
      .filter(isNostrEvent)
  }

  async fetchTrendingUsers(limit: number = 12): Promise<TTrendingUser[]> {
    if (!this.isEnabled()) {
      return []
    }

    const data = await this.fetchJson<TDiscoveryTrendingUsersResponse>('/v1/users/trending', {
      limit: Math.min(limit, 50)
    })

    return (data.users ?? []).map((user) => ({
      pubkey: user.pubkey,
      newFollowers: user.new_followers
    }))
  }

  async fetchTrendingHashtags(limit: number = 12): Promise<TTrendingHashtag[]> {
    if (!this.isEnabled()) {
      return []
    }

    const data = await this.fetchJson<TDiscoveryTrendingHashtagsResponse>(
      '/v1/hashtags/trending',
      {
        limit: Math.min(limit, 50)
      }
    )

    return data.hashtags ?? []
  }
}

const instance = new DiscoveryService()
export default instance
