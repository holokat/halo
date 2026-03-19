import NoteList, { TNoteListRef } from '@/components/NoteList'
import { RefreshButton } from '@/components/RefreshButton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BIG_RELAY_URLS, POLL_KINDS, POLL_TYPE } from '@/constants'
import { getPollMetadataFromEvent } from '@/lib/event-metadata'
import { getLegacyZapPollResults } from '@/lib/poll'
import { useFeed } from '@/providers/FeedProvider'
import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import pollResultsService from '@/services/poll-results.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const RESULTS_PREFETCH_BATCH_SIZE = 6
const CLOCK_REFRESH_INTERVAL_MS = 30 * 1000

type PollFeedTab = 'active' | 'voted' | 'ended'
type PollMetadata = NonNullable<ReturnType<typeof getPollMetadataFromEvent>>

export default function PollsFeed() {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { feedInfo } = useFeed()
  const { hideUntrustedNotes } = useUserTrust()
  const { lowBandwidthMode } = useLowBandwidthMode()
  const supportTouch = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, [])
  const noteListRef = useRef<TNoteListRef>(null)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [loadedEvents, setLoadedEvents] = useState<Event[]>([])
  const [activeTab, setActiveTab] = useState<PollFeedTab>('active')
  const [now, setNow] = useState(() => dayjs().unix())
  const [pollResultsVersion, setPollResultsVersion] = useState(0)
  const [noteStatsVersion, setNoteStatsVersion] = useState(0)
  const pollKinds = useMemo(() => [...POLL_KINDS], [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (feedInfo.feedType !== 'polls' || !pubkey) {
        setSubRequests([])
        setLoadedEvents([])
        return
      }

      const followings = await client.fetchFollowings(pubkey)
      if (cancelled) return

      setSubRequests(await client.generateSubRequestsForPubkeys([pubkey, ...followings], pubkey))
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [feedInfo.feedType, pubkey])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(dayjs().unix())
    }, CLOCK_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const pollMetaById = useMemo(() => {
    const map = new Map<string, PollMetadata>()

    loadedEvents.forEach((event) => {
      const poll = getPollMetadataFromEvent(event)
      if (poll) {
        map.set(event.id, poll)
      }
    })

    return map
  }, [loadedEvents])

  const standardPollEntries = useMemo(
    () =>
      loadedEvents
        .map((event) => {
          const poll = pollMetaById.get(event.id)
          if (!poll || poll.format !== 'nip88') return null
          return { event, poll }
        })
        .filter((entry): entry is { event: Event; poll: PollMetadata } => !!entry),
    [loadedEvents, pollMetaById]
  )

  const legacyPollEntries = useMemo(
    () =>
      loadedEvents
        .map((event) => {
          const poll = pollMetaById.get(event.id)
          if (!poll || poll.format !== 'legacy_zap') return null
          return { event, poll }
        })
        .filter((entry): entry is { event: Event; poll: PollMetadata } => !!entry),
    [loadedEvents, pollMetaById]
  )

  useEffect(() => {
    if (!standardPollEntries.length) return

    const unsubscribers = standardPollEntries.map(({ event }) =>
      pollResultsService.subscribePollResults(event.id, () => {
        setPollResultsVersion((prev) => prev + 1)
      })
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [standardPollEntries])

  useEffect(() => {
    if (!legacyPollEntries.length) return

    const unsubscribers = legacyPollEntries.map(({ event }) =>
      noteStatsService.subscribeNoteStats(event.id, () => {
        setNoteStatsVersion((prev) => prev + 1)
      })
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [legacyPollEntries])

  useEffect(() => {
    let cancelled = false

    if (!standardPollEntries.length) return

    const prefetchPollResults = async () => {
      for (let index = 0; index < standardPollEntries.length; index += RESULTS_PREFETCH_BATCH_SIZE) {
        const batch = standardPollEntries.slice(index, index + RESULTS_PREFETCH_BATCH_SIZE)
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

      if (!cancelled) {
        setPollResultsVersion((prev) => prev + 1)
      }
    }

    void prefetchPollResults()

    return () => {
      cancelled = true
    }
  }, [standardPollEntries])

  useEffect(() => {
    if (!legacyPollEntries.length) return

    if (lowBandwidthMode) {
      return
    }

    void Promise.allSettled(
      legacyPollEntries.map(async ({ event, poll }) => {
        const relays = await ensurePollRelays(event.pubkey, poll)
        await noteStatsService.fetchNoteStats(event, pubkey, relays)
      })
    )
  }, [legacyPollEntries, lowBandwidthMode, pubkey])

  const pollStateById = useMemo(() => {
    const map = new Map<
      string,
      {
        isExpired: boolean
        hasVoted: boolean
      }
    >()

    loadedEvents.forEach((event) => {
      const poll = pollMetaById.get(event.id)
      if (!poll) return

      const votedOptionIds = pubkey
        ? poll.format === 'legacy_zap'
          ? Object.entries(
              getLegacyZapPollResults(poll, noteStatsService.getNoteStats(event.id)?.zaps ?? [])
                .results
            )
              .filter(([, result]) => result.voters.has(pubkey))
              .map(([optionId]) => optionId)
          : Object.entries(pollResultsService.getPollResults(event.id)?.results ?? {})
              .filter(([, voters]) => voters.has(pubkey))
              .map(([optionId]) => optionId)
        : []

      map.set(event.id, {
        isExpired: !!poll.endsAt && now > poll.endsAt,
        hasVoted: votedOptionIds.length > 0
      })
    })

    return map
  }, [loadedEvents, noteStatsVersion, now, pollMetaById, pollResultsVersion, pubkey])

  const pollCounts = useMemo(() => {
    let active = 0
    let voted = 0
    let ended = 0

    pollStateById.forEach((state) => {
      if (state.isExpired) {
        ended += 1
      } else if (state.hasVoted) {
        voted += 1
      } else {
        active += 1
      }
    })

    return { active, voted, ended }
  }, [pollStateById])

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

  const matchesActiveTab = useCallback(
    (event: Event) => {
      const pollState = pollStateById.get(event.id)
      if (!pollState) return false

      if (activeTab === 'active') {
        return !pollState.isExpired && !pollState.hasVoted
      }

      if (activeTab === 'voted') {
        return !pollState.isExpired && pollState.hasVoted
      }

      return pollState.isExpired
    },
    [activeTab, pollStateById]
  )

  const handleRefresh = useCallback(() => {
    noteListRef.current?.refresh()
  }, [])

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab as PollFeedTab)
  }, [])

  return (
    <div>
      <div className="sticky top-12 z-30 border-b bg-card/80 px-4 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="min-w-0 flex-1">
            <TabsList className="grid h-8 w-full grid-cols-3 rounded-full bg-muted/40 p-1">
              <TabsTrigger value="active" className="gap-1 rounded-full px-2 text-[11px]">
                <span>{t('Active', { defaultValue: 'Active' })}</span>
                <span className="text-[10px] text-muted-foreground">{pollCounts.active}</span>
              </TabsTrigger>
              <TabsTrigger value="voted" className="gap-1 rounded-full px-2 text-[11px]">
                <span>{t('Voted', { defaultValue: 'Voted' })}</span>
                <span className="text-[10px] text-muted-foreground">{pollCounts.voted}</span>
              </TabsTrigger>
              <TabsTrigger value="ended" className="gap-1 rounded-full px-2 text-[11px]">
                <span>{t('Ended', { defaultValue: 'Ended' })}</span>
                <span className="text-[10px] text-muted-foreground">{pollCounts.ended}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {!supportTouch && <RefreshButton onClick={handleRefresh} />}
        </div>
      </div>

      <NoteList
        ref={noteListRef}
        subRequests={subRequests}
        showKinds={pollKinds}
        isMainFeed
        initialEoseThreshold={1}
        hideReplies
        hideUntrustedNotes={hideUntrustedNotes}
        onEventsChange={setLoadedEvents}
        additionalFilter={matchesActiveTab}
        additionalFilteredOutMessage={emptyTabText}
        stopAutoLoadWhenNoVisibleEvents={false}
        maxAutoLoadWhenNoVisibleEvents={2}
        emptyStateMessage={t('No polls from people you follow right now.', {
          defaultValue: 'No polls from people you follow right now.'
        })}
      />
    </div>
  )
}

async function ensurePollRelays(creator: string, poll: { relayUrls: string[] }) {
  const relays = poll.relayUrls.slice(0, 4)
  if (!relays.length) {
    const relayList = await client.fetchRelayList(creator)
    relays.push(...relayList.read.slice(0, 4))
  }
  return relays.length ? relays : BIG_RELAY_URLS
}
