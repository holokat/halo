import { BIG_RELAY_URLS, ExtendedKind, POLL_TYPE } from '@/constants'
import { getPollMetadataFromEvent, getPollResponseFromEvent } from '@/lib/event-metadata'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useFollowList } from '@/providers/FollowListProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import client from '@/services/client.service'
import dayjs from 'dayjs'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  areSamePollEventLists,
  buildInteractionFilters,
  buildPollResponseFilter,
  ensurePollRelays,
  getPollStateSnapshot,
  mergePollEvents,
  PollWidgetTab,
  resolvePollWidgetRelays,
  sortEventsByRecency,
  type PollMetadata,
  POLL_LIMIT,
  POLL_REFRESH_INTERVAL_MS,
  CLOCK_REFRESH_INTERVAL_MS,
  RESULTS_PREFETCH_BATCH_SIZE
} from './poll-widget.utils'
import pollResultsService from '@/services/poll-results.service'

type TQueuedFetchOptions = { showSkeleton?: boolean } | null

export function usePollWidgetData() {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { followings } = useFollowList()
  const { isEventDeleted } = useDeletedEvent()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const { repliesMap, addReplies } = useReply()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const { toggleWidget, hideWidgetTitles, isWidgetCollapsed } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [relayUrls, setRelayUrls] = useState<string[]>(BIG_RELAY_URLS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => dayjs().unix())
  const [activeTab, setActiveTab] = useState<PollWidgetTab>('active')
  const [pollResultsVersion, setPollResultsVersion] = useState(0)
  const isMountedRef = useRef(true)
  const pollSubCloserRef = useRef<{ close: () => void } | null>(null)
  const activitySubCloserRef = useRef<{ close: () => void } | null>(null)
  const fetchPollsPromiseRef = useRef<Promise<void> | null>(null)
  const queuedFetchOptionsRef = useRef<TQueuedFetchOptions>(null)

  const widgetName = AVAILABLE_WIDGETS.find((widget) => widget.id === 'polls')?.name || 'Polls'
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('polls')

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      pollSubCloserRef.current?.close()
      activitySubCloserRef.current?.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!followings.length) {
      setRelayUrls(BIG_RELAY_URLS)
      return
    }

    void resolvePollWidgetRelays(followings).then((nextRelayUrls) => {
      if (!cancelled && isMountedRef.current) {
        setRelayUrls(nextRelayUrls)
      }
    })

    return () => {
      cancelled = true
    }
  }, [followings])

  const fetchPollsInternal = useCallback(
    async ({ showSkeleton = false }: { showSkeleton?: boolean } = {}) => {
      if (!followings.length) {
        if (isMountedRef.current) {
          setEvents([])
          setLoading(false)
          setRefreshing(false)
        }
        return
      }

      if (showSkeleton) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const fetchedEvents = await client.fetchEvents(relayUrls, {
          kinds: [ExtendedKind.POLL],
          authors: followings,
          limit: POLL_LIMIT
        })

        if (!isMountedRef.current) return
        const nextEvents = sortEventsByRecency(fetchedEvents).slice(0, POLL_LIMIT)
        setEvents((currentEvents) =>
          areSamePollEventLists(currentEvents, nextEvents) ? currentEvents : nextEvents
        )
      } catch (error) {
        console.error('Failed to fetch polls widget events:', error)
        if (showSkeleton && isMountedRef.current) {
          setEvents([])
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [followings, relayUrls]
  )

  const fetchPolls = useCallback(
    ({ showSkeleton = false }: { showSkeleton?: boolean } = {}) => {
      queuedFetchOptionsRef.current = {
        showSkeleton:
          (queuedFetchOptionsRef.current?.showSkeleton ?? false) || showSkeleton
      }

      if (fetchPollsPromiseRef.current) {
        return fetchPollsPromiseRef.current
      }

      const run = async () => {
        while (queuedFetchOptionsRef.current) {
          const nextOptions = queuedFetchOptionsRef.current
          queuedFetchOptionsRef.current = null
          await fetchPollsInternal(nextOptions)
        }
      }

      const promise = run().finally(() => {
        if (fetchPollsPromiseRef.current === promise) {
          fetchPollsPromiseRef.current = null
        }
      })

      fetchPollsPromiseRef.current = promise
      return promise
    },
    [fetchPollsInternal]
  )

  useEffect(() => {
    void fetchPolls({ showSkeleton: true })

    const refreshInterval = window.setInterval(() => {
      void fetchPolls()
    }, POLL_REFRESH_INTERVAL_MS)
    const clockInterval = window.setInterval(() => {
      setNow(dayjs().unix())
    }, CLOCK_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(refreshInterval)
      window.clearInterval(clockInterval)
    }
  }, [fetchPolls])

  useEffect(() => {
    pollSubCloserRef.current?.close()

    if (!followings.length) {
      return
    }

    const sub = client.subscribe(
      relayUrls,
      {
        kinds: [ExtendedKind.POLL],
        authors: followings,
        limit: POLL_LIMIT
      },
      {
        onevent: (event: Event) => {
          if (!isMountedRef.current) return
          setEvents((prev) => sortEventsByRecency(mergePollEvents(prev, [event])).slice(0, POLL_LIMIT))
          setLoading(false)
          setRefreshing(false)
        },
        oneose: (eosed: boolean) => {
          if (!eosed || !isMountedRef.current) return
          setLoading(false)
          setRefreshing(false)
        }
      }
    )

    pollSubCloserRef.current = sub

    return () => {
      sub.close()
    }
  }, [followings, relayUrls])

  const trackedPollEvents = useMemo(() => {
    const idSet = new Set<string>()

    return events
      .filter((event) => {
        if (isEventDeleted(event)) return false
        if (mutePubkeySet.has(event.pubkey)) return false
        if (!followings.includes(event.pubkey)) return false
        if (!event.tags.length) return false
        if (idSet.has(event.id)) return false
        idSet.add(event.id)
        return true
      })
      .sort((a, b) => b.created_at - a.created_at)
  }, [events, followings, isEventDeleted, mutePubkeySet])

  const trackedPollIds = useMemo(() => trackedPollEvents.map((event) => event.id), [trackedPollEvents])
  const trackedPollIdsKey = useMemo(() => trackedPollIds.join('|'), [trackedPollIds])
  const relayUrlsKey = useMemo(() => relayUrls.join('|'), [relayUrls])

  const pollMetaById = useMemo(() => {
    const map = new Map<string, PollMetadata>()
    trackedPollEvents.forEach((event) => {
      const poll = getPollMetadataFromEvent(event)
      if (poll) {
        map.set(event.id, poll)
      }
    })
    return map
  }, [trackedPollEvents])

  const standardPollIds = useMemo(
    () =>
      trackedPollEvents
        .filter((event) => pollMetaById.get(event.id)?.format === 'nip88')
        .map((event) => event.id),
    [pollMetaById, trackedPollEvents]
  )

  useEffect(() => {
    if (!standardPollIds.length) return

    const unsubscribers = standardPollIds.map((pollId) =>
      pollResultsService.subscribePollResults(pollId, () => {
        setPollResultsVersion((prev) => prev + 1)
      })
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [standardPollIds])

  useEffect(() => {
    let cancelled = false

    if (!trackedPollEvents.length) return

    const prefetchPollResults = async () => {
      const pollEntries = trackedPollEvents
        .map((event) => {
          const poll = pollMetaById.get(event.id)
          if (!poll || poll.format !== 'nip88') return null
          return { event, poll }
        })
        .filter((entry): entry is { event: Event; poll: PollMetadata } => !!entry)

      for (let index = 0; index < pollEntries.length; index += RESULTS_PREFETCH_BATCH_SIZE) {
        const batch = pollEntries.slice(index, index + RESULTS_PREFETCH_BATCH_SIZE)
        await Promise.allSettled(
          batch.map(async ({ event, poll }) => {
            const relays = await ensurePollRelays(event.pubkey, poll)
            await pollResultsService.fetchResults(
              event.id,
              relays,
              poll.options.map((option) => option.id),
              poll.pollType === POLL_TYPE.MULTIPLE_CHOICE,
              poll.endsAt
            )
          })
        )

        if (cancelled) return
      }

      if (!cancelled && isMountedRef.current) {
        setPollResultsVersion((prev) => prev + 1)
      }
    }

    void prefetchPollResults()

    return () => {
      cancelled = true
    }
  }, [pollMetaById, relayUrlsKey, trackedPollEvents])

  useEffect(() => {
    activitySubCloserRef.current?.close()

    if (!trackedPollIds.length) return

    const interactionFilters = buildInteractionFilters(trackedPollIds)
    const pollResponseFilter = buildPollResponseFilter(trackedPollIds)
    let cancelled = false

    const fetchReplies = async () => {
      try {
        const replyGroups = await Promise.all(
          interactionFilters.map((filter) => client.fetchEvents(relayUrls, filter))
        )

        if (cancelled || !isMountedRef.current) return
        addReplies(replyGroups.flat())
      } catch (error) {
        console.error('Failed to fetch poll widget replies:', error)
      }
    }

    void fetchReplies()

    const sub = client.subscribe(relayUrls, [...interactionFilters, pollResponseFilter], {
      onevent: (event) => {
        if (!isMountedRef.current) return

        if (event.kind === ExtendedKind.POLL_RESPONSE) {
          const pollEventId = event.tags.find(([tagName]) => tagName === 'e')?.[1]
          const poll = pollEventId ? pollMetaById.get(pollEventId) : undefined
          if (!pollEventId || !poll) return

          const parsedResponse = getPollResponseFromEvent(
            event,
            poll.options.map((option) => option.id),
            poll.pollType === POLL_TYPE.MULTIPLE_CHOICE
          )
          if (!parsedResponse) return

          if (!pollResultsService.getPollResults(pollEventId)) return
          pollResultsService.addPollResponse(
            pollEventId,
            parsedResponse.pubkey,
            parsedResponse.selectedOptionIds
          )
          return
        }

        addReplies([event])
      }
    })

    activitySubCloserRef.current = sub

    return () => {
      cancelled = true
      sub.close()
    }
  }, [addReplies, pollMetaById, relayUrls, trackedPollIdsKey])

  const pollItems = useMemo(() => {
    return getPollStateSnapshot({
      trackedPollEvents,
      pollMetaById,
      pubkey,
      now,
      repliesMap,
      hideUntrustedInteractions,
      isUserTrustedForInteractions,
      mutePubkeySet,
      hideContentMentioningMutedUsers: !!hideContentMentioningMutedUsers
    })
  }, [
    hideContentMentioningMutedUsers,
    hideUntrustedInteractions,
    isUserTrustedForInteractions,
    mutePubkeySet,
    now,
    pollMetaById,
    pollResultsVersion,
    pubkey,
    repliesMap,
    trackedPollEvents
  ])

  const activeItems = useMemo(
    () =>
      pollItems
        .filter((item) => !item.isExpired && !item.hasVoted)
        .sort((a, b) => b.event.created_at - a.event.created_at),
    [pollItems]
  )

  const votedItems = useMemo(
    () =>
      pollItems
        .filter((item) => !item.isExpired && item.hasVoted)
        .sort((a, b) => b.event.created_at - a.event.created_at),
    [pollItems]
  )

  const endedItems = useMemo(
    () =>
      pollItems
        .filter((item) => item.isExpired)
        .sort((a, b) => {
          const aEndedAt = a.poll.endsAt ?? a.event.created_at
          const bEndedAt = b.poll.endsAt ?? b.event.created_at
          if (aEndedAt !== bEndedAt) {
            return bEndedAt - aEndedAt
          }
          return b.event.created_at - a.event.created_at
        }),
    [pollItems]
  )

  const currentItems =
    activeTab === 'active' ? activeItems : activeTab === 'voted' ? votedItems : endedItems

  const emptyTabText =
    activeTab === 'active'
      ? t('No active polls you have not voted in yet.', {
          defaultValue: 'No active polls you have not voted in yet.'
        })
      : activeTab === 'voted'
        ? t('No active polls you have voted in yet.', {
            defaultValue: 'No active polls you have voted in yet.'
          })
        : t('No ended polls right now.', {
            defaultValue: 'No ended polls right now.'
          })

  return {
    activeItems,
    activeTab,
    currentItems,
    endedItems,
    emptyTabText,
    fetchPolls,
    followings,
    hideWidgetTitles,
    isCollapsed,
    isHovered,
    loading,
    now,
    pubkey,
    refreshing,
    setActiveTab,
    setIsHovered,
    t,
    toggleWidget,
    trackedPollEvents,
    votedItems,
    widgetName
  }
}
