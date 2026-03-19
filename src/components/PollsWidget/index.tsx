import Image from '@/components/Image'
import WidgetContainer from '@/components/WidgetContainer'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCount } from '@/components/NoteStats/utils'
import { BIG_RELAY_URLS, ExtendedKind, POLL_TYPE } from '@/constants'
import { useFetchPollResults } from '@/hooks/useFetchPollResults'
import { createPollResponseDraftEvent } from '@/lib/draft-event'
import { isMentioningMutedUsers } from '@/lib/event'
import { getPollMetadataFromEvent, getPollResponseFromEvent } from '@/lib/event-metadata'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useFollowList } from '@/providers/FollowListProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import client from '@/services/client.service'
import pollResultsService, { type TPollResults } from '@/services/poll-results.service'
import dayjs from 'dayjs'
import { CheckCircle2, EyeOff, Loader2, MessageCircle, RefreshCcw, Trophy } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const POLL_LIMIT = 60
const POLL_REFRESH_INTERVAL_MS = 60 * 1000
const CLOCK_REFRESH_INTERVAL_MS = 30 * 1000
const MAX_POLL_WIDGET_RELAYS = 24
const RELAYS_PER_AUTHOR = 2
const WIDGET_HEIGHT_CLASS = 'max-h-[420px]'
const RESULTS_PREFETCH_BATCH_SIZE = 6
const INTERACTION_FETCH_LIMIT_MULTIPLIER = 24

type PollWidgetTab = 'active' | 'voted' | 'ended'

type PollMetadata = NonNullable<ReturnType<typeof getPollMetadataFromEvent>>

type PollWidgetItem = {
  event: Event
  poll: PollMetadata
  pollResults: TPollResults | undefined
  votedOptionIds: string[]
  isExpired: boolean
  hasVoted: boolean
  commentCount: number
}

export default function PollsWidget() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { pubkey } = useNostr()
  const { followings } = useFollowList()
  const { isEventDeleted } = useDeletedEvent()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const { repliesMap, addReplies } = useReply()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const { toggleWidget, hideWidgetTitles } = useWidgets()
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

  const widgetName = AVAILABLE_WIDGETS.find((widget) => widget.id === 'polls')?.name || 'Polls'

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

  const fetchPolls = useCallback(
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
        setEvents(sortEventsByRecency(fetchedEvents).slice(0, POLL_LIMIT))
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
        if (!getPollMetadataFromEvent(event)) return false
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

  useEffect(() => {
    if (!trackedPollIds.length) return

    const unsubscribers = trackedPollIds.map((pollId) =>
      pollResultsService.subscribePollResults(pollId, () => {
        setPollResultsVersion((prev) => prev + 1)
      })
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [trackedPollIds])

  useEffect(() => {
    let cancelled = false

    if (!trackedPollEvents.length) return

    const prefetchPollResults = async () => {
      const pollEntries = trackedPollEvents
        .map((event) => {
          const poll = pollMetaById.get(event.id)
          if (!poll) return null
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
    return trackedPollEvents
      .map((event) => {
        const poll = pollMetaById.get(event.id)
        if (!poll) return null

        const pollResults = pollResultsService.getPollResults(event.id)
        const votedOptionIds = pubkey
          ? Object.entries(pollResults?.results ?? {})
              .filter(([, voters]) => voters.has(pubkey))
              .map(([optionId]) => optionId)
          : []
        const isExpired = !!poll.endsAt && now > poll.endsAt
        const commentCount = getVisibleReplyCount({
          eventId: event.id,
          repliesMap,
          hideUntrustedInteractions,
          isUserTrustedForInteractions,
          mutePubkeySet,
          hideContentMentioningMutedUsers
        })

        return {
          event,
          poll,
          pollResults,
          votedOptionIds,
          isExpired,
          hasVoted: votedOptionIds.length > 0,
          commentCount
        }
      })
      .filter((item): item is PollWidgetItem => !!item)
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

  return (
    <WidgetContainer className="flex flex-col">
      {!hideWidgetTitles && (
        <CardHeader
          className="group flex flex-row items-center justify-between space-y-0 border-b p-4 pb-3"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <CardTitle className="font-semibold" style={{ fontSize: '14px' }}>
            {widgetName}
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
              onClick={() => void fetchPolls()}
              title={t('Refresh polls', { defaultValue: 'Refresh polls' })}
              aria-label={t('Refresh polls', { defaultValue: 'Refresh polls' })}
              disabled={loading || refreshing}
            >
              <RefreshCcw className={cn('h-3.5 w-3.5', (loading || refreshing) && 'animate-spin')} />
            </button>
            {isHovered && (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => toggleWidget('polls')}
                title={t('Hide widget', { defaultValue: 'Hide widget' })}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
      )}

      <div
        className={cn(
          WIDGET_HEIGHT_CLASS,
          'overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y scrollbar-hide px-4 pb-4',
          hideWidgetTitles ? 'pt-4' : ''
        )}
      >
        {loading ? (
          <div className="space-y-2.5 pt-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border/70 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="mb-2 h-4 w-3/4" />
                <div className="space-y-1.5">
                  <Skeleton className="h-7 w-full rounded-md" />
                  <Skeleton className="h-7 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : !pubkey ? (
          <EmptyState
            text={t('Log in and follow people to see polls in this widget.', {
              defaultValue: 'Log in and follow people to see polls in this widget.'
            })}
          />
        ) : followings.length === 0 ? (
          <EmptyState
            text={t('Follow people to see their polls here.', {
              defaultValue: 'Follow people to see their polls here.'
            })}
          />
        ) : trackedPollEvents.length === 0 ? (
          <EmptyState
            text={t('No polls from people you follow right now.', {
              defaultValue: 'No polls from people you follow right now.'
            })}
          />
        ) : (
          <div className="pt-1">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PollWidgetTab)}>
              <TabsList className="grid h-8 w-full grid-cols-3 rounded-full bg-muted/40 p-1">
                <TabsTrigger value="active" className="gap-1 rounded-full px-2 text-[11px]">
                  <span>{t('Active', { defaultValue: 'Active' })}</span>
                  <span className="text-[10px] text-muted-foreground">{activeItems.length}</span>
                </TabsTrigger>
                <TabsTrigger value="voted" className="gap-1 rounded-full px-2 text-[11px]">
                  <span>{t('Voted', { defaultValue: 'Voted' })}</span>
                  <span className="text-[10px] text-muted-foreground">{votedItems.length}</span>
                </TabsTrigger>
                <TabsTrigger value="ended" className="gap-1 rounded-full px-2 text-[11px]">
                  <span>{t('Ended', { defaultValue: 'Ended' })}</span>
                  <span className="text-[10px] text-muted-foreground">{endedItems.length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {currentItems.length === 0 ? (
              <EmptyState className="mt-2" text={emptyTabText} />
            ) : (
              <div className="mt-2 space-y-2">
                {currentItems.map((item) => (
                  <CompactPollCard
                    key={item.event.id}
                    event={item.event}
                    poll={item.poll}
                    now={now}
                    commentCount={item.commentCount}
                    votedOptionIds={item.votedOptionIds}
                    isExpired={item.isExpired}
                    onOpen={() => push(toNote(item.event))}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}

function CompactPollCard({
  event,
  poll,
  now,
  commentCount,
  votedOptionIds,
  isExpired,
  onOpen
}: {
  event: Event
  poll: PollMetadata
  now: number
  commentCount: number
  votedOptionIds: string[]
  isExpired: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { pubkey, publish, checkLogin } = useNostr()
  const pollResults = useFetchPollResults(event.id)
  const [isVoting, setIsVoting] = useState(false)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])

  const isMultipleChoice = poll.pollType === POLL_TYPE.MULTIPLE_CHOICE
  const hasVoted = votedOptionIds.length > 0
  const canVote = !isExpired && !hasVoted && !isVoting
  const showResults = isExpired || hasVoted || event.pubkey === pubkey

  const fetchResults = useCallback(async () => {
    if (isLoadingResults) return

    setIsLoadingResults(true)
    try {
      const relays = await ensurePollRelays(event.pubkey, poll)
      const results = await pollResultsService.fetchResults(
        event.id,
        relays,
        poll.options.map((option) => option.id),
        isMultipleChoice,
        poll.endsAt
      )
      return results
    } catch (error) {
      console.error('Failed to fetch compact poll results:', error)
      toast.error('Failed to fetch poll results: ' + (error as Error).message)
    } finally {
      setIsLoadingResults(false)
    }
  }, [event.id, event.pubkey, isLoadingResults, isMultipleChoice, poll])

  useEffect(() => {
    if (!showResults || pollResults || isLoadingResults) return
    void fetchResults()
  }, [fetchResults, isLoadingResults, pollResults, showResults])

  const handleVote = useCallback(
    async (optionIds: string[]) => {
      if (!optionIds.length) return

      await checkLogin(async () => {
        if (!pubkey) return

        setIsVoting(true)
        try {
          const existingResults = pollResults ?? (await fetchResults())
          if (existingResults?.voters.has(pubkey)) {
            return
          }

          const additionalRelayUrls = await ensurePollRelays(event.pubkey, poll)
          const draftEvent = createPollResponseDraftEvent(event, optionIds)
          await publish(draftEvent, {
            additionalRelayUrls
          })

          setSelectedOptionIds([])
          pollResultsService.addPollResponse(event.id, pubkey, optionIds)
        } catch (error) {
          console.error('Failed to vote from polls widget:', error)
          toast.error('Failed to vote: ' + (error as Error).message)
        } finally {
          setIsVoting(false)
        }
      })
    },
    [checkLogin, event, fetchResults, poll, pollResults, pubkey, publish]
  )

  const handleOptionClick = (optionId: string) => {
    if (!canVote) return

    if (isMultipleChoice) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      )
      return
    }

    void handleVote([optionId])
  }

  const optionResults = poll.options.map((option) => {
    const votes = pollResults?.results?.[option.id]?.size ?? 0
    const totalVotes = pollResults?.totalVotes ?? 0
    const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0

    return {
      ...option,
      votes,
      percentage
    }
  })
  const highestVoteCount = optionResults.reduce((maxVotes, option) => Math.max(maxVotes, option.votes), 0)
  const winningOptionCount =
    highestVoteCount > 0
      ? optionResults.filter((option) => option.votes === highestVoteCount).length
      : 0

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-lg border border-border/70 bg-background/50 p-3 text-left transition-colors hover:bg-accent/40"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <SimpleUserAvatar userId={event.pubkey} size="tiny" className="shrink-0" />
        <SimpleUsername
          userId={event.pubkey}
          className="min-w-0 truncate text-[11px] font-medium text-muted-foreground"
        />
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            isExpired
              ? 'bg-muted text-muted-foreground'
              : hasVoted
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          )}
        >
          {isExpired
            ? t('Ended', { defaultValue: 'Ended' })
            : hasVoted
              ? t('Voted', { defaultValue: 'Voted' })
              : t('Active', { defaultValue: 'Active' })}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{getPollPrompt(event.content, t)}</p>

      {isMultipleChoice && canVote && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t('Select one or more options', {
            defaultValue: 'Select one or more options'
          })}
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {optionResults.map((option) =>
          showResults ? (
            (() => {
              const isWinningOption =
                isExpired && highestVoteCount > 0 && option.votes === highestVoteCount

              return (
                <div
                  key={option.id}
                  className={cn(
                    'relative overflow-hidden rounded-md border bg-muted/20',
                    isWinningOption
                      ? 'border-primary/50 bg-primary/5 shadow-sm'
                      : 'border-border/70'
                  )}
                >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-r-sm transition-all duration-700',
                  isWinningOption ? 'bg-primary/30' : 'bg-primary/18',
                  votedOptionIds.includes(option.id) && 'bg-primary/28'
                )}
                style={{ width: `${option.percentage}%` }}
              />
              <div className="relative flex items-center gap-2 px-2 py-1.5">
                <PollOptionThumbnail image={option.image} alt={option.label} className="size-7" />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[11px] leading-tight',
                    (votedOptionIds.includes(option.id) || isWinningOption) && 'font-medium text-foreground'
                  )}
                >
                  {option.label}
                </span>
                {isWinningOption && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                    <Trophy className="h-2.5 w-2.5" />
                    {winningOptionCount > 1
                      ? t('Tied', { defaultValue: 'Tied' })
                      : t('Winner', { defaultValue: 'Winner' })}
                  </span>
                )}
                {votedOptionIds.includes(option.id) && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span
                  className={cn(
                    'shrink-0 text-[10px] text-muted-foreground',
                    isWinningOption && 'font-semibold text-foreground'
                  )}
                >
                  {Math.round(option.percentage)}%
                </span>
              </div>
            </div>
              )
            })()
          ) : (
            <button
              key={option.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-left text-[11px] transition-colors',
                selectedOptionIds.includes(option.id)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-primary/5'
              )}
              onClick={(event) => {
                event.stopPropagation()
                void handleOptionClick(option.id)
              }}
              disabled={!canVote}
            >
              <div className="flex min-w-0 items-center gap-2">
                <PollOptionThumbnail image={option.image} alt={option.label} className="size-7" />
                <span className="truncate leading-tight">{option.label}</span>
              </div>
              {isVoting && !isMultipleChoice && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </button>
          )
        )}
      </div>

      {isMultipleChoice && canVote && selectedOptionIds.length > 0 && (
        <Button
          className="mt-2 h-7 w-full text-xs"
          disabled={isVoting}
          onClick={(event) => {
            event.stopPropagation()
            void handleVote(selectedOptionIds)
          }}
        >
          {isVoting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t('Vote', { defaultValue: 'Vote' })}
        </Button>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {showResults
              ? t('{{number}} votes', {
                  number: pollResults?.totalVotes ?? 0,
                  defaultValue: '{{number}} votes'
                })
              : formatPollStatusLabel(poll.endsAt, now, t)}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1',
              commentCount === 0 && 'opacity-60'
            )}
          >
            <MessageCircle className="h-3 w-3" />
            <span>{formatCount(commentCount) || 0}</span>
          </span>
        </div>
        <span className="shrink-0">
          {showResults
            ? isLoadingResults && !pollResults
              ? t('Loading...', { defaultValue: 'Loading...' })
              : t('Open note', { defaultValue: 'Open note' })
            : isMultipleChoice
              ? t('Vote below', { defaultValue: 'Vote below' })
              : t('Tap an option', { defaultValue: 'Tap an option' })}
        </span>
      </div>
    </div>
  )
}

function PollOptionThumbnail({
  image,
  alt,
  className
}: {
  image?: string
  alt: string
  className?: string
}) {
  if (!image) return null

  return (
    <Image
      image={{ url: image }}
      alt={alt}
      className="h-full w-full object-cover"
      classNames={{ wrapper: cn('shrink-0 rounded-[6px] border bg-muted/30', className) }}
      hideIfError
    />
  )
}

function EmptyState({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground',
        className
      )}
    >
      {text}
    </div>
  )
}

function mergePollEvents(existing: Event[], incoming: Event[]) {
  const eventMap = new Map(existing.map((event) => [event.id, event]))
  incoming.forEach((event) => {
    eventMap.set(event.id, event)
  })
  return Array.from(eventMap.values())
}

function sortEventsByRecency(events: Event[]) {
  return [...events].sort((a, b) => b.created_at - a.created_at)
}

function getVisibleReplyCount({
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

function buildInteractionFilters(eventIds: string[]) {
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

function buildPollResponseFilter(eventIds: string[]) {
  return {
    kinds: [ExtendedKind.POLL_RESPONSE],
    '#e': eventIds,
    limit: Math.max(200, eventIds.length * INTERACTION_FETCH_LIMIT_MULTIPLIER)
  }
}

function getPollPrompt(content: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const prompt = content.replace(/\s+/g, ' ').trim()
  return (
    prompt ||
    t('Untitled poll', {
      defaultValue: 'Untitled poll'
    })
  )
}

function formatPollStatusLabel(
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

async function resolvePollWidgetRelays(followings: string[]) {
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

async function ensurePollRelays(creator: string, poll: { relayUrls: string[] }) {
  const relays = poll.relayUrls.slice(0, 4)
  if (!relays.length) {
    const relayList = await client.fetchRelayList(creator)
    relays.push(...relayList.read.slice(0, 4))
  }
  return relays.length ? relays : BIG_RELAY_URLS
}
