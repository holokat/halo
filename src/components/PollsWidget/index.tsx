import WidgetContainer from '@/components/WidgetContainer'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BIG_RELAY_URLS, ExtendedKind, POLL_TYPE } from '@/constants'
import { useFetchPollResults } from '@/hooks/useFetchPollResults'
import { getPollMetadataFromEvent } from '@/lib/event-metadata'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useFollowList } from '@/providers/FollowListProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import client from '@/services/client.service'
import pollResultsService from '@/services/poll-results.service'
import dayjs from 'dayjs'
import { BarChart3, EyeOff, RefreshCcw } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const POLL_LIMIT = 60
const DISPLAY_COUNT = 12
const POLL_REFRESH_INTERVAL_MS = 60 * 1000
const CLOCK_REFRESH_INTERVAL_MS = 30 * 1000
const MAX_POLL_WIDGET_RELAYS = 24
const RELAYS_PER_AUTHOR = 2
const WIDGET_HEIGHT_CLASS = 'max-h-[420px]'

export default function PollsWidget() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { pubkey } = useNostr()
  const { followings } = useFollowList()
  const { isEventDeleted } = useDeletedEvent()
  const { mutePubkeySet } = useMuteList()
  const { toggleWidget, hideWidgetTitles } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [relayUrls, setRelayUrls] = useState<string[]>(BIG_RELAY_URLS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => dayjs().unix())
  const isMountedRef = useRef(true)
  const subCloserRef = useRef<{ close: () => void } | null>(null)

  const widgetName = AVAILABLE_WIDGETS.find((widget) => widget.id === 'polls')?.name || 'Polls'

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      subCloserRef.current?.close()
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
        setEvents(sortPollEvents(fetchedEvents, dayjs().unix()).slice(0, POLL_LIMIT))
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
    subCloserRef.current?.close()

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
          setEvents((prev) => sortPollEvents(mergePollEvents(prev, [event]), dayjs().unix()).slice(0, POLL_LIMIT))
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

    subCloserRef.current = sub

    return () => {
      sub.close()
    }
  }, [followings, relayUrls])

  const visibleEvents = useMemo(() => {
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
      .sort((a, b) => comparePollEvents(a, b, now))
      .slice(0, DISPLAY_COUNT)
  }, [events, followings, isEventDeleted, mutePubkeySet, now])

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
            text={t('Follow people to see their active and finished polls here.', {
              defaultValue: 'Follow people to see their active and finished polls here.'
            })}
          />
        ) : visibleEvents.length === 0 ? (
          <EmptyState
            text={t('No polls from people you follow right now.', {
              defaultValue: 'No polls from people you follow right now.'
            })}
          />
        ) : (
          <div className="space-y-2.5 pt-1">
            {visibleEvents.map((event) => (
              <CompactPollCard key={event.id} event={event} now={now} onOpen={() => push(toNote(event.id))} />
            ))}
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}

function CompactPollCard({
  event,
  now,
  onOpen
}: {
  event: Event
  now: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const poll = useMemo(() => getPollMetadataFromEvent(event), [event])
  const pollResults = useFetchPollResults(event.id)
  const [isLoadingResults, setIsLoadingResults] = useState(false)

  const isExpired = !!poll?.endsAt && now > poll.endsAt
  const isMultipleChoice = poll?.pollType === POLL_TYPE.MULTIPLE_CHOICE
  const validPollOptionIds = useMemo(() => poll?.options.map((option) => option.id) || [], [poll])

  const fetchResults = useCallback(async () => {
    if (!poll || isLoadingResults) return

    setIsLoadingResults(true)
    try {
      const relays = await ensurePollRelays(event.pubkey, poll)
      await pollResultsService.fetchResults(
        event.id,
        relays,
        validPollOptionIds,
        isMultipleChoice,
        poll.endsAt
      )
    } catch (error) {
      console.error('Failed to fetch compact poll results:', error)
    } finally {
      setIsLoadingResults(false)
    }
  }, [event.id, event.pubkey, isLoadingResults, isMultipleChoice, poll, validPollOptionIds])

  useEffect(() => {
    if (!poll || !isExpired || pollResults || isLoadingResults) return
    void fetchResults()
  }, [fetchResults, isExpired, isLoadingResults, poll, pollResults])

  if (!poll) {
    return null
  }

  const sortedResults = poll.options
    .map((option) => {
      const votes = pollResults?.results?.[option.id]?.size ?? 0
      const totalVotes = pollResults?.totalVotes ?? 0
      const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0
      return { ...option, votes, percentage }
    })
    .sort((a, b) => {
      if (b.votes !== a.votes) {
        return b.votes - a.votes
      }
      return a.label.localeCompare(b.label)
    })

  const visibleActiveOptions = poll.options.slice(0, 3)
  const hiddenActiveOptionsCount = Math.max(poll.options.length - visibleActiveOptions.length, 0)
  const visibleFinishedOptions = sortedResults.slice(0, 4)
  const hiddenFinishedOptionsCount = Math.max(sortedResults.length - visibleFinishedOptions.length, 0)

  return (
    <button
      type="button"
      className="w-full rounded-lg border border-border/70 bg-background/50 p-3 text-left transition-colors hover:bg-accent/40"
      onClick={onOpen}
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
            isExpired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
          )}
        >
          {isExpired
            ? t('Finished', { defaultValue: 'Finished' })
            : t('Active', { defaultValue: 'Active' })}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{getPollPrompt(event.content, t)}</p>

      <div className="mt-2 space-y-1.5">
        {isExpired ? (
          pollResults ? (
            <>
              {visibleFinishedOptions.map((option) => (
                <div
                  key={option.id}
                  className="relative overflow-hidden rounded-md border border-border/70 bg-muted/20"
                >
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-r-sm bg-primary/20 transition-all duration-700',
                      option.votes > 0 && 'bg-primary/25'
                    )}
                    style={{ width: `${option.percentage}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-[11px] leading-tight">{option.label}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {Math.round(option.percentage)}%
                    </span>
                  </div>
                </div>
              ))}
              {hiddenFinishedOptionsCount > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {t('+{{count}} more options', {
                    count: hiddenFinishedOptionsCount,
                    defaultValue: '+{{count}} more options'
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-2 py-2 text-[11px] text-muted-foreground">
              {isLoadingResults
                ? t('Loading results...', { defaultValue: 'Loading results...' })
                : t('Loading results...', { defaultValue: 'Loading results...' })}
            </div>
          )
        ) : (
          <>
            {visibleActiveOptions.map((option) => (
              <div
                key={option.id}
                className="truncate rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground"
              >
                {option.label}
              </div>
            ))}
            {hiddenActiveOptionsCount > 0 && (
              <div className="text-[10px] text-muted-foreground">
                {t('+{{count}} more options', {
                  count: hiddenActiveOptionsCount,
                  defaultValue: '+{{count}} more options'
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {isExpired
            ? t('{{number}} votes', {
                number: pollResults?.totalVotes ?? 0,
                defaultValue: '{{number}} votes'
              })
            : formatPollStatusLabel(poll.endsAt, now, t)}
        </span>
        <span className="shrink-0">
          {isExpired
            ? t('Open poll', { defaultValue: 'Open poll' })
            : t('Tap to vote', { defaultValue: 'Tap to vote' })}
        </span>
      </div>
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
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

function sortPollEvents(events: Event[], now: number) {
  return [...events].sort((a, b) => comparePollEvents(a, b, now))
}

function comparePollEvents(a: Event, b: Event, now: number) {
  const aMeta = getPollMetadataFromEvent(a)
  const bMeta = getPollMetadataFromEvent(b)
  const aExpired = !!aMeta?.endsAt && now > aMeta.endsAt
  const bExpired = !!bMeta?.endsAt && now > bMeta.endsAt

  if (aExpired !== bExpired) {
    return aExpired ? 1 : -1
  }

  if (!aExpired && !bExpired) {
    return b.created_at - a.created_at
  }

  const aEndedAt = aMeta?.endsAt ?? a.created_at
  const bEndedAt = bMeta?.endsAt ?? b.created_at
  if (aEndedAt !== bEndedAt) {
    return bEndedAt - aEndedAt
  }

  return b.created_at - a.created_at
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
