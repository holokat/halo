import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { isMentioningMutedUsers } from '@/lib/event'
import { getPollMetadataFromEvent } from '@/lib/event-metadata'
import client from '@/services/client.service'
import { type TLegacyZapPollResults, getDefaultLegacyZapPollAmount, getLegacyZapPollResults } from '@/lib/poll'
import noteStatsService from '@/services/note-stats.service'
import pollResultsService, { type TPollResults } from '@/services/poll-results.service'
import { Event, kinds } from 'nostr-tools'

export const POLL_LIMIT = 60
export const POLL_REFRESH_INTERVAL_MS = 60 * 1000
export const CLOCK_REFRESH_INTERVAL_MS = 30 * 1000
export const MAX_POLL_WIDGET_RELAYS = 24
export const RELAYS_PER_AUTHOR = 2
export const WIDGET_HEIGHT_CLASS = 'max-h-[420px]'
export const RESULTS_PREFETCH_BATCH_SIZE = 6
export const INTERACTION_FETCH_LIMIT_MULTIPLIER = 24

export type PollWidgetTab = 'active' | 'voted' | 'ended'

export type PollMetadata = NonNullable<ReturnType<typeof getPollMetadataFromEvent>>

export type PollWidgetItem = {
  event: Event
  poll: PollMetadata
  pollResults: TPollResults | undefined
  legacyResults?: TLegacyZapPollResults
  votedOptionIds: string[]
  isExpired: boolean
  hasVoted: boolean
  commentCount: number
}

export function areSamePollEventLists(currentEvents: Event[], nextEvents: Event[]) {
  if (currentEvents.length !== nextEvents.length) {
    return false
  }

  for (let index = 0; index < currentEvents.length; index += 1) {
    const currentEvent = currentEvents[index]
    const nextEvent = nextEvents[index]

    if (
      currentEvent.id !== nextEvent.id ||
      currentEvent.created_at !== nextEvent.created_at ||
      currentEvent.pubkey !== nextEvent.pubkey
    ) {
      return false
    }
  }

  return true
}

export function mergePollEvents(existing: Event[], incoming: Event[]) {
  const eventMap = new Map(existing.map((event) => [event.id, event]))
  incoming.forEach((event) => {
    eventMap.set(event.id, event)
  })
  return Array.from(eventMap.values())
}

export function sortEventsByRecency(events: Event[]) {
  return [...events].sort((a, b) => b.created_at - a.created_at)
}

export function getVisibleReplyCount({
  eventId,
  repliesMap,
  hideUntrustedInteractions,
  isUserTrustedForInteractions,
  mutePubkeySet,
  hideContentMentioningMutedUsers
}: {
  eventId: string
  repliesMap: Map<string, { events: Event[]; eventIdSet: Set<string> }>
  hideUntrustedInteractions: boolean
  isUserTrustedForInteractions: (pubkey: string) => boolean
  mutePubkeySet: Set<string>
  hideContentMentioningMutedUsers?: boolean
}) {
  return (
    repliesMap.get(eventId)?.events.filter((reply) => {
      if (hideUntrustedInteractions && !isUserTrustedForInteractions(reply.pubkey)) {
        return false
      }
      if (mutePubkeySet.has(reply.pubkey)) {
        return false
      }
      if (hideContentMentioningMutedUsers && isMentioningMutedUsers(reply, mutePubkeySet)) {
        return false
      }
      return true
    }).length ?? 0
  )
}

export function buildInteractionFilters(eventIds: string[]) {
  const limit = Math.max(200, eventIds.length * INTERACTION_FETCH_LIMIT_MULTIPLIER)

  return [
    {
      kinds: [kinds.ShortTextNote],
      '#e': eventIds,
      limit
    },
    {
      kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
      '#E': eventIds,
      limit
    }
  ]
}

export function buildPollResponseFilter(eventIds: string[]) {
  return {
    kinds: [ExtendedKind.POLL_RESPONSE],
    '#e': eventIds,
    limit: Math.max(200, eventIds.length * INTERACTION_FETCH_LIMIT_MULTIPLIER)
  }
}

export function getPollPrompt(content: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const prompt = content.replace(/\s+/g, ' ').trim()
  return (
    prompt ||
    t('Untitled poll', {
      defaultValue: 'Untitled poll'
    })
  )
}

export function formatPollStatusLabel(
  endsAt: number | undefined,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!endsAt) {
    return t('Open-ended poll', { defaultValue: 'Open-ended poll' })
  }

  if (endsAt <= now) {
    return t('Poll has ended', { defaultValue: 'Poll has ended' })
  }

  const endsAtDate = new Date(endsAt * 1000)
  return t('Ends {{time}}', {
    time: endsAtDate.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }),
    defaultValue: 'Ends {{time}}'
  })
}

export async function resolvePollWidgetRelays(followings: string[]) {
  const relaySet = new Set<string>(BIG_RELAY_URLS)

  try {
    const relayLists = await client.fetchRelayLists(followings)
    relayLists.forEach((relayList) => {
      relayList.read.slice(0, RELAYS_PER_AUTHOR).forEach((relay) => {
        const normalizedRelay = relay ? relay.toString() : ''
        if (normalizedRelay) {
          relaySet.add(normalizedRelay)
        }
      })
    })
  } catch (error) {
    console.error('Failed to resolve poll widget relays:', error)
  }

  return Array.from(relaySet).slice(0, MAX_POLL_WIDGET_RELAYS)
}

export async function ensurePollRelays(creator: string, poll: { relayUrls: string[] }) {
  const relays = poll.relayUrls.slice(0, 4)
  if (!relays.length) {
    const relayList = await client.fetchRelayList(creator)
    relays.push(...relayList.read.slice(0, 4))
  }
  return relays.length ? relays : BIG_RELAY_URLS
}

export function getPollStateSnapshot(params: {
  trackedPollEvents: Event[]
  pollMetaById: Map<string, PollMetadata>
  pubkey: string | null
  now: number
  repliesMap: Map<string, { events: Event[]; eventIdSet: Set<string> }>
  hideUntrustedInteractions: boolean
  isUserTrustedForInteractions: (pubkey: string) => boolean
  mutePubkeySet: Set<string>
  hideContentMentioningMutedUsers: boolean
}) {
  return params.trackedPollEvents.reduce<PollWidgetItem[]>((items, event) => {
    const poll = params.pollMetaById.get(event.id)
    if (!poll) return items
    const pubkey = params.pubkey ?? ''

    const pollResults =
      poll.format === 'nip88' ? pollResultsService.getPollResults(event.id) : undefined
    const legacyResults =
      poll.format === 'legacy_zap'
        ? getLegacyZapPollResults(poll, noteStatsService.getNoteStats(event.id)?.zaps ?? [])
        : undefined
    const votedOptionIds = pubkey
      ? poll.format === 'legacy_zap'
        ? Object.entries(legacyResults?.results ?? {})
            .filter(([, result]) => result.voters.has(pubkey))
            .map(([optionId]) => optionId)
        : Object.entries(pollResults?.results ?? {})
            .filter(([, voters]) => voters.has(pubkey))
            .map(([optionId]) => optionId)
      : []
    const isExpired = !!poll.endsAt && params.now > poll.endsAt
    const commentCount = getVisibleReplyCount({
      eventId: event.id,
      repliesMap: params.repliesMap,
      hideUntrustedInteractions: params.hideUntrustedInteractions,
      isUserTrustedForInteractions: params.isUserTrustedForInteractions,
      mutePubkeySet: params.mutePubkeySet,
      hideContentMentioningMutedUsers: params.hideContentMentioningMutedUsers
    })

    items.push({
      event,
      poll,
      pollResults,
      legacyResults,
      votedOptionIds,
      isExpired,
      hasVoted: votedOptionIds.length > 0,
      commentCount
    })

    return items
  }, [])
}
