import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useDistractionFreeMode } from '@/providers/DistractionFreeModeProvider'
import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useTextOnlyMode } from '@/providers/TextOnlyModeProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event, matchFilter } from 'nostr-tools'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PullToRefresh from 'react-simple-pull-to-refresh'
import { toast } from 'sonner'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'
import PinnedNoteCard from '../PinnedNoteCard'
import { useVisibleNoteEvents } from './useVisibleNoteEvents'

const LIMIT = 200
const ALGO_LIMIT = 500
const SHOW_COUNT_STANDARD = 10
const SHOW_COUNT_TEXT_ONLY = 50

const NoteList = forwardRef(
  (
    {
      subRequests,
      showKinds,
      isMainFeed = false,
      mediaOnly = false,
      onDisableMediaOnly,
      filterMutedNotes = true,
      hideReplies = false,
      hideUntrustedNotes = false,
      ignoreHashtagLimit = false,
      areAlgoRelays = false,
      showRelayCloseReason = false,
      pinnedEventIds = [],
      onEventsChange,
      additionalFilter,
      additionalFilteredOutMessage,
      stopAutoLoadWhenNoVisibleEvents = true,
      maxAutoLoadWhenNoVisibleEvents = 2,
      emptyStateMessage,
      initialEoseThreshold
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      isMainFeed?: boolean
      mediaOnly?: boolean
      onDisableMediaOnly?: () => void
      filterMutedNotes?: boolean
      hideReplies?: boolean
      hideUntrustedNotes?: boolean
      ignoreHashtagLimit?: boolean
      areAlgoRelays?: boolean
      showRelayCloseReason?: boolean
      pinnedEventIds?: string[]
      onEventsChange?: (events: Event[]) => void
      additionalFilter?: (event: Event) => boolean
      additionalFilteredOutMessage?: string
      stopAutoLoadWhenNoVisibleEvents?: boolean
      maxAutoLoadWhenNoVisibleEvents?: number
      emptyStateMessage?: string
      initialEoseThreshold?: number
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { startLogin, pubkey } = useNostr()
    const { lowBandwidthMode } = useLowBandwidthMode()
    const { isUserTrusted } = useUserTrust()
    const { textOnlyMode } = useTextOnlyMode()
    const { mutePubkeySet, getMutedWords, getMutedTags } = useMuteList()
    const { hideContentMentioningMutedUsers, maxHashtags, maxMentions } = useContentPolicy()
    const mutedWords = useMemo(() => getMutedWords(), [getMutedWords])
    const mutedWordsLower = useMemo(() => mutedWords.map((word) => word.toLowerCase()), [mutedWords])
    const mutedTags = useMemo(() => getMutedTags(), [getMutedTags])
    const { isEventDeleted } = useDeletedEvent()
    const { isDistractionFree } = useDistractionFreeMode()
    const showCountIncrement = textOnlyMode ? SHOW_COUNT_TEXT_ONLY : SHOW_COUNT_STANDARD
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [hasMore, setHasMore] = useState<boolean>(true)
    const [loading, setLoading] = useState(true)
    const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
    const [refreshCount, setRefreshCount] = useState(0)
    const [showCount, setShowCount] = useState(showCountIncrement)
    const supportTouch = useMemo(() => isTouchDevice(), [])
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const topRef = useRef<HTMLDivElement | null>(null)
    const refreshTimeoutRef = useRef<number | null>(null)
    const filteredOutAutoLoadCountRef = useRef(0)
    const subRequestsKey = JSON.stringify(subRequests)
    const showKindsKey = JSON.stringify(showKinds)
    const { filteredNewEvents, hashtagLimitFilteredOutAll, mediaOnlyFilteredOutAll, visibleEvents } =
      useVisibleNoteEvents({
        additionalFilter,
        events,
        filterMutedNotes,
        hideContentMentioningMutedUsers: !!hideContentMentioningMutedUsers,
        hideReplies,
        hideUntrustedNotes,
        ignoreHashtagLimit,
        isEventDeleted,
        isUserTrusted,
        mediaOnly,
        maxHashtags,
        maxMentions,
        mutePubkeySet,
        mutedTags,
        mutedWordsLower,
        newEvents,
        pinnedEventIds
      })
    const showFilteredOutState = !loading && events.length > 0 && visibleEvents.length === 0
    const filteredOutMessage = mediaOnlyFilteredOutAll
      ? t('This relay is returning posts, but the media-only filter is hiding them.')
      : hashtagLimitFilteredOutAll
        ? t('This feed is returning posts, but the hashtag filter is hiding them.')
        : additionalFilteredOutMessage || t('No notes match the current filters.')

    const filteredEvents = useMemo(() => visibleEvents.slice(0, showCount), [visibleEvents, showCount])

    const scrollToTop = (behavior: ScrollBehavior = 'instant') => {
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior, block: 'start' })
      }, 20)
    }

    const refresh = () => {
      scrollToTop()
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        filteredOutAutoLoadCountRef.current = 0
        setRefreshCount((count) => count + 1)
        refreshTimeoutRef.current = null
      }, 250)
    }

    useImperativeHandle(ref, () => ({ scrollToTop, refresh }), [])

    useEffect(() => {
      return () => {
        if (refreshTimeoutRef.current !== null) {
          window.clearTimeout(refreshTimeoutRef.current)
        }
      }
    }, [])

    useEffect(() => {
      if (visibleEvents.length > 0) {
        filteredOutAutoLoadCountRef.current = 0
      }
    }, [visibleEvents.length])

    useEffect(() => {
      if (!subRequests.length) return

      async function init() {
        setLoading(true)
        setEvents([])
        setNewEvents([])
        setHasMore(true)

        if (showKinds.length === 0) {
          setLoading(false)
          setHasMore(false)
          return () => {}
        }

        const { closer, timelineKey } = await client.subscribeTimeline(
          subRequests.map(({ urls, filter }) => ({
            urls,
            filter: {
              kinds: showKinds,
              ...filter,
              limit: areAlgoRelays ? ALGO_LIMIT : LIMIT
            }
          })),
          {
            onEvents: (events, eosed) => {
              if (events.length > 0) {
                setEvents(events)
              }
              if (areAlgoRelays) {
                setHasMore(false)
              }
              if (eosed) {
                setLoading(false)
                setHasMore(events.length > 0)
              }
            },
            onNew: (event) => {
              if (pubkey && event.pubkey === pubkey) {
                // If the new event is from the current user, insert it directly into the feed
                setEvents((oldEvents) =>
                  oldEvents.some((e) => e.id === event.id) ? oldEvents : [event, ...oldEvents]
                )
              } else {
                // Otherwise, buffer it and show the New Notes button
                setNewEvents((oldEvents) =>
                  [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
                )
              }
            },
            onClose: (url, reason) => {
              if (!showRelayCloseReason) return
              // ignore reasons from nostr-tools
              if (
                [
                  'closed by caller',
                  'relay connection errored',
                  'relay connection closed',
                  'pingpong timed out',
                  'relay connection closed by us'
                ].includes(reason)
              ) {
                return
              }

              toast.error(`${url}: ${reason}`)
            }
          },
          {
            startLogin,
            needSort: !areAlgoRelays,
            cacheRecentEvents: isMainFeed && !areAlgoRelays,
            initialEoseThreshold
          }
        )
        setTimelineKey(timelineKey)
        return closer
      }

      const promise = init()
      return () => {
        promise.then((closer) => closer())
      }
    }, [subRequestsKey, refreshCount, showKindsKey, isMainFeed, areAlgoRelays, initialEoseThreshold])

    useEffect(() => {
      if (!pubkey || !subRequests.length || showKinds.length === 0) {
        return
      }

      const handler = (data: globalThis.Event) => {
        const event = (data as CustomEvent<Event>).detail
        if (event.pubkey !== pubkey) {
          return
        }

        const matchesFeed = subRequests.some(({ filter }) =>
          matchFilter(
            {
              kinds: showKinds,
              ...filter
            },
            event
          )
        )
        if (!matchesFeed) {
          return
        }

        client.addEventToCache(event)
        setNewEvents((oldEvents) => oldEvents.filter((oldEvent) => oldEvent.id !== event.id))
        setEvents((oldEvents) => {
          if (oldEvents.some((oldEvent) => oldEvent.id === event.id)) {
            return oldEvents
          }

          return [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
        })
      }

      client.addEventListener('newEvent', handler)
      return () => {
        client.removeEventListener('newEvent', handler)
      }
    }, [pubkey, showKindsKey, subRequestsKey])

    useEffect(() => {
      if (onEventsChange) {
        onEventsChange(events)
      }
    }, [events, onEventsChange])

    useEffect(() => {
      if (lowBandwidthMode || !events.length) return

      const notesToPrefetch = events.slice(
        0,
        Math.min(events.length, Math.max(showCount + 60, showCountIncrement * 12))
      )
      const relayUrls = Array.from(new Set(subRequests.flatMap((request) => request.urls))).slice(0, 20)
      noteStatsService.prefetchNoteStats(notesToPrefetch, pubkey, undefined, relayUrls)
    }, [events, showCount, showCountIncrement, pubkey, lowBandwidthMode, subRequests])

    useEffect(() => {
      const options = {
        root: null,
        rootMargin: '10px',
        threshold: 0.1
      }

      const loadMore = async () => {
        const remainingVisibleEvents = visibleEvents.length - showCount
        if (remainingVisibleEvents > 0) {
          setShowCount((prev) => prev + showCountIncrement)
          if (remainingVisibleEvents > showCountIncrement) {
            return
          }
        }

        // Avoid a runaway load-more loop when filters hide every fetched event.
        const noVisibleEventsButLoaded = visibleEvents.length === 0 && events.length > 0

        if (noVisibleEventsButLoaded) {
          if (stopAutoLoadWhenNoVisibleEvents) {
            return
          }

          if (filteredOutAutoLoadCountRef.current >= maxAutoLoadWhenNoVisibleEvents) {
            return
          }
        }

        if (!timelineKey || loading || !hasMore) return
        setLoading(true)
        const newEvents = await client.loadMoreTimeline(
          timelineKey,
          events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
          LIMIT
        )
        setLoading(false)
        if (newEvents.length === 0) {
          setHasMore(false)
          return
        }

        if (noVisibleEventsButLoaded) {
          filteredOutAutoLoadCountRef.current += 1
        }

        setEvents((oldEvents) => [...oldEvents, ...newEvents])
      }

      const observerInstance = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore()
        }
      }, options)

      const currentBottomRef = bottomRef.current

      if (currentBottomRef) {
        observerInstance.observe(currentBottomRef)
      }

      return () => {
        if (observerInstance && currentBottomRef) {
          observerInstance.unobserve(currentBottomRef)
        }
      }
    }, [
      loading,
      hasMore,
      events,
      showCount,
      showCountIncrement,
      timelineKey,
      visibleEvents.length,
      stopAutoLoadWhenNoVisibleEvents,
      maxAutoLoadWhenNoVisibleEvents
    ])

    const showNewEvents = () => {
      setEvents((oldEvents) => [...newEvents, ...oldEvents])
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    const list = (
      <div className="min-h-screen">
        <ul role="feed" aria-label="Notes feed" className="list-none">
          {pinnedEventIds.map((id) => (
            <li key={id}>
              <PinnedNoteCard eventId={id} className="w-full" />
            </li>
          ))}
          {filteredEvents.map((event) => (
            <li key={event.id}>
              <NoteCard
                className="w-full"
                event={event}
                filterMutedNotes={filterMutedNotes}
              />
            </li>
          ))}
        </ul>
        {loading ? (
          <div ref={bottomRef}>
            <div role="status" aria-live="polite" className="sr-only">
              {loading && t('Loading more posts')}
            </div>
            <NoteCardLoadingSkeleton />
          </div>
        ) : showFilteredOutState ? (
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground mt-4 px-4">
            <div>{filteredOutMessage}</div>
            {mediaOnlyFilteredOutAll && onDisableMediaOnly && (
              <Button variant="outline" onClick={onDisableMediaOnly}>
                {t('Show posts without media')}
              </Button>
            )}
          </div>
        ) : hasMore ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : events.length ? (
          <div role="status" aria-live="polite" className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
        ) : emptyStateMessage ? (
          <div className="text-center text-sm text-muted-foreground mt-4 px-4">
            {emptyStateMessage}
          </div>
        ) : (
          <div className="flex justify-center w-full mt-2">
            <Button size="lg" onClick={() => setRefreshCount((count) => count + 1)}>
              {t('reload notes')}
            </Button>
          </div>
        )}
      </div>
    )

    return (
      <div>
        {filteredNewEvents.length > 0 && !isDistractionFree && (
          <NewNotesButton newEvents={filteredNewEvents} onClick={showNewEvents} />
        )}
        <div ref={topRef} className="scroll-mt-[calc(6rem+1px)]" />
        {supportTouch ? (
          <PullToRefresh
            onRefresh={async () => {
              refresh()
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }}
            pullingContent=""
          >
            {list}
          </PullToRefresh>
        ) : (
          list
        )}
        <div className="h-40" />
      </div>
    )
  }
)
NoteList.displayName = 'NoteList'
export default NoteList

export type TNoteListRef = {
  scrollToTop: (behavior?: ScrollBehavior) => void
  refresh: () => void
}
