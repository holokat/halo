import {
  BIG_RELAY_URLS,
  DEFAULT_READ_RELAY_URLS,
  DEFAULT_WRITE_RELAY_URLS,
  ExtendedKind,
  RECOMMENDED_RELAYS,
  SEARCHABLE_RELAY_URLS
} from '@/constants'
import { getRelayDiscoveryFromEvent } from '@/lib/event-metadata'
import { normalizeUrl } from '@/lib/url'
import relayHealthService, { TRelayHealthResult } from '@/services/relay-health.service'
import relayInfoService from '@/services/relay-info.service'
import client from './client.service'

type TDiscoveryCandidate = NonNullable<ReturnType<typeof getRelayDiscoveryFromEvent>>

export type TInboxRelayRecommendation = {
  url: string
  score: number
  followerCount: number
  health?: TRelayHealthResult
  supportsNip17: boolean
  supportsAuth: boolean
  relayType?: string
  reasons: string[]
}

type TFollowRelaySignal = {
  inboxFollowerCount: number
}

const DISCOVERY_CACHE_MS = 15 * 60 * 1000
const RECOMMENDATION_CACHE_MS = 10 * 60 * 1000
const DISCOVERY_LIMIT = 300
const MAX_CANDIDATES_FOR_ENRICHMENT = 18
const MONITOR_DISCOVERY_RELAYS = Array.from(
  new Set(BIG_RELAY_URLS.concat(SEARCHABLE_RELAY_URLS).map((url) => normalizeUrl(url)).filter(Boolean))
)

type TCachedRecommendation = {
  fetchedAt: number
  recommendations: TInboxRelayRecommendation[]
}

class InboxRelayRecommendationsService {
  private static instance: InboxRelayRecommendationsService
  private recommendationCache = new Map<string, TCachedRecommendation>()
  private inflightRecommendationRequests = new Map<string, Promise<TInboxRelayRecommendation[]>>()
  private discoveryCache:
    | {
        fetchedAt: number
        candidates: Map<string, TDiscoveryCandidate>
      }
    | undefined

  public static getInstance(): InboxRelayRecommendationsService {
    if (!InboxRelayRecommendationsService.instance) {
      InboxRelayRecommendationsService.instance = new InboxRelayRecommendationsService()
    }
    return InboxRelayRecommendationsService.instance
  }

  async getRecommendedInboxRelays(
    pubkey?: string | null,
    limit: number = 8
  ): Promise<TInboxRelayRecommendation[]> {
    const cacheKey = pubkey ?? '__anonymous__'
    const cached = this.recommendationCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < RECOMMENDATION_CACHE_MS) {
      return cached.recommendations.slice(0, limit)
    }

    const inflight = this.inflightRecommendationRequests.get(cacheKey)
    if (inflight) {
      const recommendations = await inflight
      return recommendations.slice(0, limit)
    }

    const promise = this._getRecommendedInboxRelays(pubkey)
    this.inflightRecommendationRequests.set(cacheKey, promise)

    try {
      const recommendations = await promise
      this.recommendationCache.set(cacheKey, {
        fetchedAt: Date.now(),
        recommendations
      })
      return recommendations.slice(0, limit)
    } finally {
      this.inflightRecommendationRequests.delete(cacheKey)
    }
  }

  async getAutoPickInboxRelayUrls(
    pubkey?: string | null,
    fallbackRelayUrls: string[] = [],
    limit: number = 3
  ): Promise<string[]> {
    const recommendations = await this.getRecommendedInboxRelays(pubkey, Math.max(limit, 8))
    const pickedRelayUrls = recommendations.slice(0, limit).map((recommendation) => recommendation.url)

    if (pickedRelayUrls.length > 0) {
      return pickedRelayUrls
    }

    return Array.from(
      new Set(
        fallbackRelayUrls
          .map((url) => normalizeUrl(url))
          .filter(Boolean)
          .slice(0, limit)
      )
    )
  }

  clearCache() {
    this.recommendationCache.clear()
    this.discoveryCache = undefined
  }

  private async _getRecommendedInboxRelays(
    pubkey?: string | null
  ): Promise<TInboxRelayRecommendation[]> {
    const discoveryCandidates = await this.getDiscoveryCandidates()
    const followRelaySignalMap = pubkey ? await this.getFollowRelaySignalMap(pubkey) : new Map()

    const candidateScoreMap = new Map<string, number>()
    const seedUrls = new Set<string>()

    discoveryCandidates.forEach((candidate, url) => {
      seedUrls.add(url)
      candidateScoreMap.set(url, this.getBaseDiscoveryScore(candidate))
    })

    followRelaySignalMap.forEach((signal, normalizedUrl) => {
      seedUrls.add(normalizedUrl)
      candidateScoreMap.set(
        normalizedUrl,
        (candidateScoreMap.get(normalizedUrl) ?? 0) + Math.min(36, signal.inboxFollowerCount * 6)
      )
    })

    DEFAULT_READ_RELAY_URLS.concat(DEFAULT_WRITE_RELAY_URLS, RECOMMENDED_RELAYS).forEach((url) => {
      const normalizedUrl = normalizeUrl(url)
      if (!normalizedUrl) return
      seedUrls.add(normalizedUrl)
      candidateScoreMap.set(normalizedUrl, (candidateScoreMap.get(normalizedUrl) ?? 0) + 4)
    })

    const candidateUrls = Array.from(seedUrls)
      .sort((a, b) => (candidateScoreMap.get(b) ?? 0) - (candidateScoreMap.get(a) ?? 0))
      .slice(0, MAX_CANDIDATES_FOR_ENRICHMENT)

    if (candidateUrls.length === 0) {
      return []
    }

    const [relayInfos, healthMap] = await Promise.all([
      relayInfoService.getRelayInfos(candidateUrls),
      relayHealthService.checkRelaysHealth(candidateUrls)
    ])
    const relayInfoMap = new Map(
      relayInfos.filter(Boolean).map((relayInfo) => [relayInfo!.url, relayInfo!] as const)
    )

    const recommendations: TInboxRelayRecommendation[] = []

    candidateUrls.forEach((url) => {
      const discovery = discoveryCandidates.get(url)
      const relayInfo = relayInfoMap.get(url)
      const followRelaySignal = followRelaySignalMap.get(url)
      const health = healthMap.get(url)

      const supportsNip17 =
        discovery?.supportedNips.includes(17) || relayInfo?.supported_nips?.includes(17) || false
      const supportsAuth =
        discovery?.supportedNips.includes(42) ||
        discovery?.requirementFlags.includes('auth') ||
        relayInfo?.supported_nips?.includes(42) ||
        relayInfo?.limitation?.auth_required ||
        false
      const relayType = discovery?.relayTypes[0]
      const blocksGiftWrap = discovery?.rejectedKinds.includes(1059) ?? false
      const paymentRequired =
        discovery?.requirementFlags.includes('payment') || relayInfo?.limitation?.payment_required || false

      if (blocksGiftWrap || paymentRequired || health?.status === 'unreachable') {
        return
      }

      const reasons: string[] = []
      let score = candidateScoreMap.get(url) ?? 0

      if (supportsNip17) {
        score += 42
        reasons.push('Supports private inbox events')
      }

      if (supportsAuth) {
        score += 10
        reasons.push('Supports AUTH')
      }

      if (relayType === 'PrivateInbox') {
        score += 18
        reasons.push('Private inbox relay')
      }

      if (followRelaySignal?.inboxFollowerCount) {
        reasons.push(
          `${followRelaySignal.inboxFollowerCount} ${followRelaySignal.inboxFollowerCount === 1 ? 'follow publishes this as an inbox relay' : 'follows publish this as an inbox relay'}`
        )
      }

      if (health) {
        score += this.getHealthScore(health)
        if (health.latency) {
          reasons.push(`${health.latency}ms connection latency`)
        }
      }

      if ((discovery?.rttRead ?? discovery?.rttOpen) && !health?.latency) {
        reasons.push(`Monitor RTT ${discovery?.rttRead ?? discovery?.rttOpen}ms`)
      }

      if (relayInfo?.supported_nips?.includes(17) && !supportsNip17) {
        reasons.push('Advertises private inbox support')
      }

      recommendations.push({
        url,
        score,
        followerCount: followRelaySignal?.inboxFollowerCount ?? 0,
        health,
        supportsNip17,
        supportsAuth,
        relayType,
        reasons
      })
    })

    recommendations.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        if (b.followerCount !== a.followerCount) {
          return b.followerCount - a.followerCount
        }
        return a.url.localeCompare(b.url)
      })

    return recommendations
  }

  private async getFollowRelaySignalMap(pubkey: string) {
    const followings = await client.fetchFollowings(pubkey).catch(() => [])
    if (followings.length === 0) {
      return new Map<string, TFollowRelaySignal>()
    }

    const followInboxRelayLists = await client.fetchInboxRelayLists(followings).catch(() => [])
    const signalMap = new Map<string, TFollowRelaySignal>()

    followInboxRelayLists.forEach((relayUrls) => {
      relayUrls.forEach((url) => {
        const normalizedUrl = normalizeUrl(url)
        if (!normalizedUrl) return

        const existing = signalMap.get(normalizedUrl) ?? { inboxFollowerCount: 0 }
        existing.inboxFollowerCount += 1
        signalMap.set(normalizedUrl, existing)
      })
    })

    return signalMap
  }

  private async getDiscoveryCandidates() {
    if (this.discoveryCache && Date.now() - this.discoveryCache.fetchedAt < DISCOVERY_CACHE_MS) {
      return this.discoveryCache.candidates
    }

    const events = await client.fetchEvents(MONITOR_DISCOVERY_RELAYS, {
      kinds: [ExtendedKind.RELAY_DISCOVERY],
      limit: DISCOVERY_LIMIT
    })

    const candidates = new Map<string, TDiscoveryCandidate>()

    events.forEach((event) => {
      const discovery = getRelayDiscoveryFromEvent(event)
      if (!discovery) return

      const existing = candidates.get(discovery.url)
      if (!existing || discovery.created_at > existing.created_at) {
        candidates.set(discovery.url, discovery)
      }
    })

    this.discoveryCache = {
      fetchedAt: Date.now(),
      candidates
    }

    return candidates
  }

  private getBaseDiscoveryScore(candidate: TDiscoveryCandidate) {
    let score = 0

    if (candidate.supportedNips.includes(17)) {
      score += 26
    }
    if (candidate.supportedNips.includes(42) || candidate.requirementFlags.includes('auth')) {
      score += 8
    }
    if (candidate.relayTypes.includes('PrivateInbox')) {
      score += 12
    }
    if (candidate.acceptedKinds.includes(1059)) {
      score += 8
    }
    if (candidate.rejectedKinds.includes(1059)) {
      score -= 100
    }
    if (candidate.requirementFlags.includes('payment')) {
      score -= 40
    }
    if (typeof candidate.rttRead === 'number' || typeof candidate.rttOpen === 'number') {
      const relayRtt = candidate.rttRead ?? candidate.rttOpen ?? candidate.rttWrite
      if (typeof relayRtt === 'number') {
        score += relayRtt < 150 ? 10 : relayRtt < 300 ? 6 : relayRtt < 600 ? 2 : 0
      }
    }

    return score
  }

  private getHealthScore(health: TRelayHealthResult) {
    switch (health.status) {
      case 'great':
        return 22
      case 'good':
        return 16
      case 'average':
        return 8
      case 'poor':
        return 1
      case 'checking':
        return 0
      case 'unreachable':
      default:
        return -50
    }
  }

}

const instance = InboxRelayRecommendationsService.getInstance()
export default instance
