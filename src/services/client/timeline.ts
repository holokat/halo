import { BoundedMap } from '@/lib/bounded-map'
import { compareEvents } from '@/lib/event'
import { filterExpiredEvents } from '@/lib/event-expiration'
import indexedDb from '@/services/indexed-db.service'
import { generateMultipleTimelinesKey, generateTimelineKey } from '@/services/client/timeline-key'
import { TSubRequestFilter } from '@/types'
import { Event as NEvent, Filter } from 'nostr-tools'
import { ClientQueryHost, query } from './query'
import dayjs from 'dayjs'

export type TTimelineRef = [string, number]
export type TSingleTimeline = {
  type: 'single'
  refs: TTimelineRef[]
  filter: TSubRequestFilter
  urls: string[]
  cursor: number
}
export type TMergedTimeline = {
  type: 'merged'
  refs: TTimelineRef[]
  childKeys: string[]
  cursor: number
}
export type TTimeline = TSingleTimeline | TMergedTimeline

export const TIMELINE_CACHE_MAX = 64
const RECENT_FEED_CACHE_MAX_EVENTS = 120

export interface ClientTimelineHost extends ClientQueryHost {
  timelines: BoundedMap<string, TTimeline>
  eventDataLoader: {
    loadMany(ids: string[]): Promise<(NEvent | undefined | Error)[]>
  }
  addEventToCache(event: NEvent): void
  prefetchProfilesForEvents(events: NEvent[]): Promise<void>
  query(
    urls: string[],
    filter: Filter | Filter[],
    onevent?: (evt: NEvent) => void,
    options?: {
      timeoutMs?: number
      eoseThreshold?: number
    }
  ): Promise<NEvent[]>
  subscribe(
    urls: string[],
    filter: Filter | Filter[],
    callbacks: {
      onevent?: (evt: NEvent) => void
      oneose?: (eosed: boolean) => void
      onclose?: (url: string, reason: string) => void
      startLogin?: () => void
      onAllClose?: (reasons: string[]) => void
    }
  ): { close: () => void }
}

function compareTimelineRefs(a: TTimelineRef, b: TTimelineRef) {
  if (a[1] !== b[1]) {
    return b[1] - a[1]
  }
  if (a[0] !== b[0]) {
    return a[0] < b[0] ? -1 : 1
  }
  return 0
}

function sortEventsDesc(events: NEvent[]) {
  return events.sort((a, b) => compareEvents(b, a))
}

function buildTimelineRefs(events: NEvent[]) {
  return sortEventsDesc([...events]).map((evt) => [evt.id, evt.created_at] as TTimelineRef)
}

function mergeTimelineRefs(refs: TTimelineRef[], eventsOrRefs: NEvent[] | TTimelineRef[]) {
  const refMap = new Map<string, number>()

  refs.forEach(([id, createdAt]) => {
    refMap.set(id, createdAt)
  })

  eventsOrRefs.forEach((value) => {
    if (Array.isArray(value)) {
      refMap.set(value[0], value[1])
      return
    }

    refMap.set(value.id, value.created_at)
  })

  return Array.from(refMap.entries())
    .map(([id, createdAt]) => [id, createdAt] as TTimelineRef)
    .sort((a, b) => compareTimelineRefs(a, b))
}

async function loadEventsFromRefs(host: ClientTimelineHost, refs: TTimelineRef[]) {
  if (refs.length === 0) return []

  return filterExpiredEvents(
    await host.eventDataLoader
      .loadMany(refs.map(([id]) => id))
      .then((events) => events.filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[])
  )
}

async function takeCachedTimelineEvents(
  host: ClientTimelineHost,
  timeline: Pick<TSingleTimeline | TMergedTimeline, 'refs' | 'cursor'>,
  limit: number
) {
  const refSlice = timeline.refs.slice(timeline.cursor, timeline.cursor + limit)
  if (refSlice.length === 0) return []

  timeline.cursor += refSlice.length
  return loadEventsFromRefs(host, refSlice)
}

export function generateClientTimelineKey(urls: string[], filter: Filter) {
  return generateTimelineKey(urls, filter)
}

export function generateClientMultipleTimelinesKey(subRequests: { urls: string[]; filter: Filter }[]) {
  return generateMultipleTimelinesKey(subRequests)
}

async function subscribeSingleTimeline(
  host: ClientTimelineHost,
  urls: string[],
  filter: TSubRequestFilter,
  {
    onEvents,
    onNew,
    onClose
  }: {
    onEvents: (events: NEvent[], eosed: boolean) => void
    onNew: (evt: NEvent) => void
    onClose?: (url: string, reason: string) => void
  },
  {
    startLogin,
    needSort = true
  }: {
    startLogin?: () => void
    needSort?: boolean
  } = {}
) {
  const relays = Array.from(new Set(urls))
  const key = generateClientTimelineKey(relays, filter)
  const timeline = host.timelines.get(key)
  let cachedEvents: NEvent[] = []
  let since: number | undefined

  if (timeline?.type === 'single' && timeline.refs.length && needSort) {
    cachedEvents = (
      await host.eventDataLoader.loadMany(timeline.refs.slice(0, filter.limit).map(([id]) => id))
    ).filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[]

    if (cachedEvents.length) {
      void host.prefetchProfilesForEvents(cachedEvents)
      onEvents([...cachedEvents], false)
      since = cachedEvents[0].created_at
    }
  }

  let events: NEvent[] = []
  let eosedAt: number | null = null
  const subCloser = host.subscribe(relays, since ? { ...filter, since } : filter, {
    startLogin,
    onevent: (evt: NEvent) => {
      host.addEventToCache(evt)
      if (!eosedAt) {
        events.push(evt)
        return
      }

      if (evt.created_at > eosedAt) {
        void host.prefetchProfilesForEvents([evt])
        onNew(evt)
      }

      const timeline = host.timelines.get(key)
      if (!timeline || timeline.type !== 'single' || !timeline.refs.length) {
        return
      }

      let idx = 0
      for (const ref of timeline.refs) {
        if (evt.created_at > ref[1] || (evt.created_at === ref[1] && evt.id < ref[0])) {
          break
        }
        if (evt.created_at === ref[1] && evt.id === ref[0]) {
          return
        }
        idx++
      }

      if (idx >= timeline.refs.length) return

      timeline.refs.splice(idx, 0, [evt.id, evt.created_at])
      if (idx <= timeline.cursor) {
        timeline.cursor++
      }
    },
    oneose: (eosed) => {
      if (eosed && !eosedAt) {
        eosedAt = dayjs().unix()
      }

      if (!needSort) {
        void host.prefetchProfilesForEvents(events)
        onEvents([...events], !!eosedAt)
        return
      }

      if (!eosed) {
        events = sortEventsDesc(events).slice(0, filter.limit)
        const eventsToShow = sortEventsDesc([...events, ...cachedEvents]).slice(0, filter.limit)
        void host.prefetchProfilesForEvents(eventsToShow)
        onEvents(eventsToShow, false)
        return
      }

      events = sortEventsDesc(events).slice(0, filter.limit)
      const existingTimeline = host.timelines.get(key)

      if (!existingTimeline || existingTimeline.type !== 'single' || !existingTimeline.refs.length) {
        host.timelines.set(key, {
          type: 'single',
          refs: buildTimelineRefs(events),
          filter,
          urls: relays,
          cursor: events.length
        })
        void host.prefetchProfilesForEvents(events)
        onEvents([...events], true)
        return
      }

      const firstRef = existingTimeline.refs[0]
      const newRefs = events
        .filter((evt) => compareTimelineRefs([evt.id, evt.created_at], firstRef) < 0)
        .map((evt) => [evt.id, evt.created_at] as TTimelineRef)

      if (events.length >= filter.limit) {
        existingTimeline.refs = newRefs
        existingTimeline.cursor = events.length
        void host.prefetchProfilesForEvents(events)
        onEvents([...events], true)
        return
      }

      existingTimeline.refs = mergeTimelineRefs(existingTimeline.refs, newRefs)
      const eventsToShow = sortEventsDesc([...events, ...cachedEvents]).slice(0, filter.limit)
      existingTimeline.cursor = eventsToShow.length
      void host.prefetchProfilesForEvents(eventsToShow)
      onEvents(eventsToShow, true)
    },
    onclose: onClose
  })

  return {
    timelineKey: key,
    closer: () => {
      onEvents = () => {}
      onNew = () => {}
      subCloser.close()
    }
  }
}

export async function subscribeTimeline(
  host: ClientTimelineHost,
  subRequests: { urls: string[]; filter: TSubRequestFilter }[],
  {
    onEvents,
    onNew,
    onClose
  }: {
    onEvents: (events: NEvent[], eosed: boolean) => void
    onNew: (evt: NEvent) => void
    onClose?: (url: string, reason: string) => void
  },
  {
    startLogin,
    needSort = true,
    cacheRecentEvents = false,
    initialEoseThreshold
  }: {
    startLogin?: () => void
    needSort?: boolean
    cacheRecentEvents?: boolean
    initialEoseThreshold?: number
  } = {}
) {
  const newEventIdSet = new Set<string>()
  const requestCount = subRequests.length
  const threshold =
    typeof initialEoseThreshold === 'number' && Number.isFinite(initialEoseThreshold)
      ? Math.max(1, Math.min(requestCount, Math.floor(initialEoseThreshold)))
      : Math.floor(requestCount / 2)
  const key = generateClientMultipleTimelinesKey(subRequests)
  const recentFeedKey = cacheRecentEvents && needSort ? `recentFeed:${key}` : undefined
  const displayLimit = subRequests.length
    ? Math.max(...subRequests.map(({ filter }) => filter.limit ?? 0), 50)
    : 50
  const renderLimit = Math.min(displayLimit, RECENT_FEED_CACHE_MAX_EVENTS)
  let knownEventIdSet = new Set<string>()
  let knownEvents: NEvent[] = []
  let eosedCount = 0
  let lastPersistedSignature = ''
  let childTimelineKeys: string[] = []

  const updateMergedTimeline = (eventsToShow: NEvent[]) => {
    host.timelines.set(key, {
      type: 'merged',
      refs: buildTimelineRefs(knownEvents),
      childKeys: childTimelineKeys,
      cursor: eventsToShow.length
    })
  }

  if (recentFeedKey) {
    const cachedFeed = await indexedDb.getRecentFeed(recentFeedKey).catch(() => null)
    if (cachedFeed?.length) {
      knownEvents = filterExpiredEvents(cachedFeed.slice(0, renderLimit)).sort((a, b) =>
        compareEvents(b, a)
      )
      knownEventIdSet = new Set(knownEvents.map((evt) => evt.id))
      knownEvents.forEach((evt) => {
        host.addEventToCache(evt)
      })
      void host.prefetchProfilesForEvents(knownEvents)
      onEvents([...knownEvents], false)
    }
  }

  const subs = await Promise.all(
    subRequests.map(({ urls, filter }) =>
      subscribeSingleTimeline(
        host,
        urls,
        filter,
        {
          onEvents: (_events, _eosed) => {
            if (_eosed) {
              eosedCount++
            }

            _events.forEach((evt) => {
              if (knownEventIdSet.has(evt.id)) return
              knownEventIdSet.add(evt.id)
              knownEvents.push(evt)
            })
            knownEvents = sortEventsDesc(knownEvents)
            const eventsToShow = knownEvents.slice(0, displayLimit)

            if (eosedCount >= threshold) {
              if (recentFeedKey && eventsToShow.length > 0) {
                const snapshot = eventsToShow.slice(0, renderLimit)
                const signature = `${snapshot[0]?.id ?? ''}:${snapshot[snapshot.length - 1]?.id ?? ''}:${snapshot.length}`
                if (signature !== lastPersistedSignature) {
                  lastPersistedSignature = signature
                  void indexedDb.putRecentFeed(recentFeedKey, snapshot)
                }
              }
              updateMergedTimeline(eventsToShow)
              void host.prefetchProfilesForEvents(eventsToShow)
              onEvents(eventsToShow, eosedCount >= requestCount)
            }
          },
          onNew: (evt) => {
            if (newEventIdSet.has(evt.id)) return
            newEventIdSet.add(evt.id)
            void host.prefetchProfilesForEvents([evt])
            onNew(evt)
          },
          onClose
        },
        { startLogin, needSort }
      )
    )
  )

  childTimelineKeys = subs.map((sub) => sub.timelineKey)
  updateMergedTimeline(knownEvents.slice(0, displayLimit))

  return {
    closer: () => {
      onEvents = () => {}
      onNew = () => {}
      subs.forEach((sub) => {
        sub.closer()
      })
    },
    timelineKey: key
  }
}

export async function loadMoreTimeline(host: ClientTimelineHost, key: string, until: number, limit: number) {
  const timeline = host.timelines.get(key)
  if (!timeline) return []

  if (timeline.type === 'single') {
    return _loadMoreSingleTimeline(host, key, until, limit)
  }

  const cachedEvents = await takeCachedTimelineEvents(host, timeline, limit)
  if (cachedEvents.length >= limit) {
    void host.prefetchProfilesForEvents(cachedEvents)
    return cachedEvents
  }

  const childEvents = await Promise.all(
    timeline.childKeys.map((childKey) => loadMoreTimeline(host, childKey, until, limit))
  )

  const mergedEvents = childEvents.flat()
  if (mergedEvents.length === 0) {
    void host.prefetchProfilesForEvents(cachedEvents)
    return cachedEvents
  }

  timeline.refs = mergeTimelineRefs(timeline.refs, mergedEvents)
  const additionalEvents = await takeCachedTimelineEvents(host, timeline, limit - cachedEvents.length)
  const sortedEvents = sortEventsDesc([...cachedEvents, ...additionalEvents]).slice(0, limit)

  void host.prefetchProfilesForEvents(sortedEvents)
  return sortedEvents
}

async function _loadMoreSingleTimeline(
  host: ClientTimelineHost,
  key: string,
  until: number,
  limit: number
) {
  const timeline = host.timelines.get(key)
  if (!timeline || timeline.type !== 'single') return []

  const cachedEvents = await takeCachedTimelineEvents(host, timeline, limit)
  if (cachedEvents.length >= limit) {
    void host.prefetchProfilesForEvents(cachedEvents)
    return cachedEvents
  }

  const existingEventIds = new Set(timeline.refs.map(([id]) => id))
  const remaining = limit - cachedEvents.length
  let queryLimit = Math.max(limit, remaining * 2)
  let queryUntil = timeline.refs[timeline.refs.length - 1]?.[1] ?? until
  let additionalEvents: NEvent[] = []
  let attempts = 0

  while (additionalEvents.length < remaining && attempts < 4) {
    attempts++
    let queriedEvents = await query(host, timeline.urls, {
      ...timeline.filter,
      until: queryUntil,
      limit: queryLimit
    })
    queriedEvents.forEach((evt) => {
      host.addEventToCache(evt)
    })
    queriedEvents = sortEventsDesc(queriedEvents)

    if (queriedEvents.length === 0) {
      break
    }

    const uniqueNewEvents = queriedEvents.filter((evt) => {
      if (existingEventIds.has(evt.id)) return false
      existingEventIds.add(evt.id)
      return true
    })

    if (uniqueNewEvents.length > 0) {
      timeline.refs = mergeTimelineRefs(timeline.refs, uniqueNewEvents)
      const nextCachedEvents = await takeCachedTimelineEvents(
        host,
        timeline,
        remaining - additionalEvents.length
      )
      additionalEvents = additionalEvents.concat(nextCachedEvents)
    }

    if (queriedEvents.length < queryLimit) {
      break
    }

    queryLimit *= 2
    queryUntil = queriedEvents[queriedEvents.length - 1]?.created_at ?? queryUntil
  }

  const allEvents = sortEventsDesc([...cachedEvents, ...additionalEvents]).slice(0, limit)
  void host.prefetchProfilesForEvents(allEvents)
  return allEvents
}
