import { BIG_RELAY_URLS } from '@/constants'
import { Filter, kinds } from 'nostr-tools'

type TRelayListLike = { read: string[]; write: string[] }

export function buildNoteStatsBatchFilters(
  eventIds: Set<string>,
  replaceableCoordinates: Set<string>,
  idSinceMap: Map<string, number>
): Filter[] {
  const ids = Array.from(eventIds)
  const coordinates = Array.from(replaceableCoordinates)
  const since = idSinceMap.size ? Math.min(...idSinceMap.values()) : undefined

  const reactionLimit = Math.min(3000, Math.max(600, ids.length * 80))
  const repostLimit = Math.min(1200, Math.max(200, ids.length * 20))
  const zapLimit = Math.min(3000, Math.max(600, ids.length * 60))

  const filters: Filter[] = []

  if (ids.length) {
    filters.push(
      { '#e': ids, kinds: [kinds.Reaction], limit: reactionLimit },
      { '#e': ids, kinds: [kinds.Repost], limit: repostLimit },
      { '#e': ids, kinds: [kinds.Zap], limit: zapLimit },
      { '#e': ids, kinds: [kinds.EventDeletion], limit: reactionLimit }
    )
  }

  if (coordinates.length) {
    filters.push(
      { '#a': coordinates, kinds: [kinds.Reaction], limit: reactionLimit },
      { '#a': coordinates, kinds: [kinds.Repost], limit: repostLimit },
      { '#a': coordinates, kinds: [kinds.Zap], limit: zapLimit }
    )
  }

  if (since) {
    filters.forEach((filter) => {
      filter.since = since
    })
  }

  return filters
}

export function pickNoteStatsRelayUrls(
  relayLists: TRelayListLike[],
  seenRelayUrls: string[] = [],
  hintedRelayUrls: string[] = []
) {
  const relayScoreMap = new Map<string, number>()

  seenRelayUrls.forEach((relayUrl, index) => {
    relayScoreMap.set(relayUrl, (relayScoreMap.get(relayUrl) ?? 0) + (200 - index))
  })
  hintedRelayUrls.forEach((relayUrl, index) => {
    relayScoreMap.set(relayUrl, (relayScoreMap.get(relayUrl) ?? 0) + (140 - index))
  })

  BIG_RELAY_URLS.forEach((relayUrl, index) => {
    relayScoreMap.set(relayUrl, 100 - index)
  })

  relayLists.forEach((relayList) => {
    relayList.write.slice(0, 4).forEach((relayUrl, index) => {
      relayScoreMap.set(relayUrl, (relayScoreMap.get(relayUrl) ?? 0) + (10 - index))
    })
  })

  return Array.from(relayScoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([relayUrl]) => relayUrl)
    .slice(0, 8)
}

export function getLiveNoteStatsRelayUrls(
  eventIds: string[],
  getSeenEventRelayUrls: (eventId: string) => string[]
) {
  const relaySet = new Set<string>()
  BIG_RELAY_URLS.forEach((relayUrl) => relaySet.add(relayUrl))

  eventIds.forEach((eventId) => {
    getSeenEventRelayUrls(eventId).forEach((relayUrl) => relaySet.add(relayUrl))
  })

  return Array.from(relaySet).slice(0, 10)
}
