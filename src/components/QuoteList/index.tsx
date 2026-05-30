import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'

const LIMIT = 100
const SHOW_COUNT = 10

export default function QuoteList({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const { startLogin } = useNostr()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [events, setEvents] = useState<Event[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (quoteEvent) =>
          !hideUntrustedInteractions || isUserTrustedForInteractions(quoteEvent.pubkey)
      ),
    [events, hideUntrustedInteractions, isUserTrustedForInteractions]
  )

  useEffect(() => {
    async function init() {
      setLoading(true)
      setEvents([])
      setHasMore(true)

      const seenOn = client.getSeenEventRelayUrls(event.id)
      const relayUrls = await client.resolveAuthorOutboxRelayUrls([event.pubkey], {
        authorRelayLimit: 6,
        maxRelayCount: 10,
        relayHintsByPubkey: new Map([[event.pubkey, seenOn]])
      })

      const { closer, timelineKey } = await client.subscribeTimeline(
        [
          {
            urls: relayUrls,
            filter: {
              '#q': [
                isReplaceableEvent(event.kind) ? getReplaceableCoordinateFromEvent(event) : event.id
              ],
              kinds: [
                kinds.ShortTextNote,
                kinds.LongFormArticle,
                ExtendedKind.COMMENT,
                ExtendedKind.POLL
              ],
              limit: LIMIT
            }
          }
        ],
        {
          onEvents: (events, eosed) => {
            if (events.length > 0) {
              setEvents(events)
            }
            if (eosed) {
              setLoading(false)
              setHasMore(events.length > 0)
            }
          },
          onNew: (event) => {
            setEvents((oldEvents) =>
              [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
            )
          }
        },
        { startLogin }
      )
      setTimelineKey(timelineKey)
      return closer
    }

    const promise = init()
    return () => {
      promise.then((closer) => closer())
    }
  }, [event])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const loadMore = async () => {
      const remainingVisibleEvents = visibleEvents.length - showCount
      if (remainingVisibleEvents > 0) {
        setShowCount((prev) => prev + SHOW_COUNT)
        if (remainingVisibleEvents > SHOW_COUNT) {
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
  }, [timelineKey, loading, hasMore, events, showCount, visibleEvents.length])

  return (
    <div className={className}>
      <div className="min-h-[80vh]">
        <div>
          {visibleEvents.slice(0, showCount).map((quoteEvent) => (
            <NoteCard key={quoteEvent.id} className="w-full" event={quoteEvent} />
          ))}
        </div>
        {hasMore || loading ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
        )}
      </div>
      <div className="h-40" />
    </div>
  )
}
