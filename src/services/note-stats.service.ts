import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { getReactionBonusCountFromTags } from '@/lib/reaction'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { getEmojiInfosFromEmojiTags, tagNameEquals } from '@/lib/tag'
import client from '@/services/client.service'
import indexedDb from '@/services/indexed-db.service'
import { TEmoji, TNoteReaction } from '@/types'
import dayjs from 'dayjs'
import { Event, Filter, kinds } from 'nostr-tools'
import {
  deserializeNoteStats,
  serializeNoteStats,
  type TSerializedNoteStats
} from './note-stats/cache'
import {
  buildNoteStatsBatchFilters,
  getLiveNoteStatsRelayUrls,
  pickNoteStatsRelayUrls
} from './note-stats/query-plan'

export type TNoteStats = {
  likeIdSet: Set<string>
  likes: TNoteReaction[]
  repostPubkeySet: Set<string>
  reposts: { id: string; pubkey: string; created_at: number }[]
  zapPrSet: Set<string>
  zaps: {
    pr: string
    pubkey: string
    amount: number
    created_at: number
    comment?: string
    pollOptionId?: string
  }[]
  updatedAt?: number
}

type TTrackedNote = {
  eventId: string
  replaceableCoordinate?: string
  touchedAt: number
}

type TInteractionMeta =
  | { type: 'reaction'; targetEventId: string; pubkey: string }
  | { type: 'repost'; targetEventId: string; pubkey: string }
  | { type: 'zap'; targetEventId: string; pr: string }

const NOTE_STATS_FRESH_SECONDS = 15
const NOTE_STATS_BATCH_DEBOUNCE_MS = 40
const NOTE_STATS_PERSIST_DEBOUNCE_MS = 80
const NOTE_STATS_TRACK_TTL_SECONDS = 10 * 60
const NOTE_STATS_BATCH_MAX_NOTES = 60
const NOTE_STATS_RELAY_LIST_TIMEOUT_MS = 350

class NoteStatsService {
  static instance: NoteStatsService
  private noteStatsMap: Map<string, Partial<TNoteStats>> = new Map()
  private noteStatsSubscribers = new Map<string, Set<() => void>>()
  private pendingFetchMap = new Map<
    string,
    { event: Event; pubkey?: string | null; relayUrls?: string[] }
  >()
  private inflightFetchMap = new Map<string, Promise<Partial<TNoteStats>>>()
  private pendingResolvers = new Map<
    string,
    {
      resolve: (stats: Partial<TNoteStats>) => void
      reject: (error: unknown) => void
    }
  >()
  private fetchTimer: ReturnType<typeof setTimeout> | null = null
  private trackedNotes = new Map<string, TTrackedNote>()
  private interactionMetaById = new Map<string, TInteractionMeta>()
  private hydratedFromDbIds = new Set<string>()
  private pendingPersistIds = new Set<string>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private liveCloser: (() => void) | null = null
  private liveRefreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    if (!NoteStatsService.instance) {
      NoteStatsService.instance = this
    }
    return NoteStatsService.instance
  }

  async fetchNoteStats(event: Event, pubkey?: string | null, relayUrls: string[] = []) {
    if (!this.hydratedFromDbIds.has(event.id)) {
      await this.hydrateNoteStatsFromDb([event.id], true)
    }

    const existing = this.noteStatsMap.get(event.id)
    const now = dayjs().unix()
    if (existing?.updatedAt && now - existing.updatedAt <= NOTE_STATS_FRESH_SECONDS) {
      this.trackNote(event)
      return existing
    }

    const inflight = this.inflightFetchMap.get(event.id)
    if (inflight) {
      const pending = this.pendingFetchMap.get(event.id)
      if (pending && relayUrls.length) {
        pending.relayUrls = Array.from(new Set([...(pending.relayUrls ?? []), ...relayUrls]))
        this.pendingFetchMap.set(event.id, pending)
      }
      return inflight
    }

    this.trackNote(event)

    const promise = new Promise<Partial<TNoteStats>>((resolve, reject) => {
      this.pendingFetchMap.set(event.id, { event, pubkey, relayUrls })
      this.pendingResolvers.set(event.id, { resolve, reject })
      this.scheduleBatchFetch()
    }).finally(() => {
      this.inflightFetchMap.delete(event.id)
    })

    this.inflightFetchMap.set(event.id, promise)
    return promise
  }

  prefetchNoteStats(
    events: Event[],
    pubkey?: string | null,
    max = NOTE_STATS_BATCH_MAX_NOTES,
    relayUrls: string[] = []
  ) {
    const uniqueEvents = new Map<string, Event>()
    for (const event of events) {
      if (!event?.id || uniqueEvents.has(event.id)) continue
      uniqueEvents.set(event.id, event)
      if (uniqueEvents.size >= max) break
    }

    void this.hydrateNoteStatsFromDb(Array.from(uniqueEvents.keys()), true)

    uniqueEvents.forEach((event) => {
      void this.fetchNoteStats(event, pubkey, relayUrls).catch(() => {})
    })
  }

  subscribeNoteStats(noteId: string, callback: () => void) {
    let set = this.noteStatsSubscribers.get(noteId)
    if (!set) {
      set = new Set()
      this.noteStatsSubscribers.set(noteId, set)
    }
    set.add(callback)
    return () => {
      set?.delete(callback)
      if (set?.size === 0) this.noteStatsSubscribers.delete(noteId)
    }
  }

  private notifyNoteStats(noteId: string) {
    const set = this.noteStatsSubscribers.get(noteId)
    if (set) {
      set.forEach((cb) => cb())
    }
  }

  getNoteStats(id: string): Partial<TNoteStats> | undefined {
    return this.noteStatsMap.get(id)
  }

  addZap(
    pubkey: string,
    eventId: string,
    pr: string,
    amount: number,
    comment?: string,
    created_at: number = dayjs().unix(),
    notify: boolean = true,
    pollOptionId?: string
  ) {
    const old = this.noteStatsMap.get(eventId) || {}
    const zapPrSet = old.zapPrSet || new Set()
    const zaps = old.zaps || []
    if (zapPrSet.has(pr)) return

    zapPrSet.add(pr)
    zaps.push({ pr, pubkey, amount, comment, created_at, pollOptionId })
    this.noteStatsMap.set(eventId, { ...old, zapPrSet, zaps })
    this.schedulePersist(eventId)
    if (notify) {
      this.notifyNoteStats(eventId)
    }
    return eventId
  }

  updateNoteStatsByEvents(events: Event[]) {
    const updatedEventIdSet = new Set<string>()
    events.forEach((evt) => {
      let updatedEventId: string | undefined
      if (evt.kind === kinds.Reaction) {
        updatedEventId = this.addLikeByEvent(evt)
      } else if (evt.kind === kinds.Repost) {
        updatedEventId = this.addRepostByEvent(evt)
      } else if (evt.kind === kinds.Zap) {
        updatedEventId = this.addZapByEvent(evt)
      } else if (evt.kind === kinds.EventDeletion) {
        this.removeInteractionsByDeletionEvent(evt).forEach((id) => updatedEventIdSet.add(id))
      }
      if (updatedEventId) {
        updatedEventIdSet.add(updatedEventId)
      }
    })
    updatedEventIdSet.forEach((eventId) => {
      this.notifyNoteStats(eventId)
      this.schedulePersist(eventId)
    })
  }

  removeInteractionById(interactionId: string) {
    const updatedEventId = this.removeInteractionByIdInternal(interactionId)
    if (!updatedEventId) return

    this.notifyNoteStats(updatedEventId)
    this.schedulePersist(updatedEventId)
    return updatedEventId
  }

  private addLikeByEvent(evt: Event) {
    const targetEventId = evt.tags.findLast(tagNameEquals('e'))?.[1]
    if (!targetEventId) return

    const old = this.noteStatsMap.get(targetEventId) || {}
    const likeIdSet = old.likeIdSet || new Set()
    const likes = old.likes || []
    if (likeIdSet.has(evt.id)) return

    let emoji: TEmoji | string = evt.content.trim()
    if (!emoji) return

    if (emoji.startsWith(':') && emoji.endsWith(':')) {
      const emojiInfos = getEmojiInfosFromEmojiTags(evt.tags)
      const shortcode = emoji.split(':')[1]
      const emojiInfo = emojiInfos.find((info) => info.shortcode === shortcode)
      if (emojiInfo) {
        emoji = emojiInfo
      } else {
        emoji = '+'
      }
    }

    const bonusCount = getReactionBonusCountFromTags(evt.tags)

    likeIdSet.add(evt.id)
    likes.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at, emoji, bonusCount })
    this.noteStatsMap.set(targetEventId, { ...old, likeIdSet, likes })
    this.interactionMetaById.set(evt.id, {
      type: 'reaction',
      targetEventId,
      pubkey: evt.pubkey
    })
    return targetEventId
  }

  private addRepostByEvent(evt: Event) {
    const eventId = evt.tags.find(tagNameEquals('e'))?.[1]
    if (!eventId) return

    const old = this.noteStatsMap.get(eventId) || {}
    const repostPubkeySet = old.repostPubkeySet || new Set()
    const reposts = old.reposts || []
    if (repostPubkeySet.has(evt.pubkey)) return

    repostPubkeySet.add(evt.pubkey)
    reposts.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(eventId, { ...old, repostPubkeySet, reposts })
    this.interactionMetaById.set(evt.id, { type: 'repost', targetEventId: eventId, pubkey: evt.pubkey })
    return eventId
  }

  private addZapByEvent(evt: Event) {
    const info = getZapInfoFromEvent(evt)
    if (!info) return
    const { originalEventId, senderPubkey, invoice, amount, comment, pollOptionId } = info
    if (!originalEventId || !senderPubkey) return

    const targetEventId = this.addZap(
      senderPubkey,
      originalEventId,
      invoice,
      amount,
      comment,
      evt.created_at,
      false,
      pollOptionId
    )
    if (targetEventId) {
      this.interactionMetaById.set(evt.id, { type: 'zap', targetEventId, pr: invoice })
    }
    return targetEventId
  }

  private scheduleBatchFetch() {
    if (this.fetchTimer) return
    this.fetchTimer = setTimeout(() => {
      this.fetchTimer = null
      void this.flushBatchFetches()
    }, NOTE_STATS_BATCH_DEBOUNCE_MS)
  }

  private async flushBatchFetches() {
    if (!this.pendingFetchMap.size) return

    const requestById = new Map<
      string,
      { event: Event; pubkey?: string | null; relayUrls?: string[] }
    >()
    Array.from(this.pendingFetchMap.values())
      .slice(0, NOTE_STATS_BATCH_MAX_NOTES)
      .forEach((request) => {
      requestById.set(request.event.id, request)
    })
    requestById.forEach((_request, id) => {
      this.pendingFetchMap.delete(id)
    })

    const now = dayjs().unix()
    const ids = Array.from(requestById.keys())

    try {
      const idSinceMap = new Map<string, number>()
      const authors = new Set<string>()
      const eventIds = new Set<string>()
      const replaceableCoordinates = new Set<string>()
      const seenRelayUrls = new Set<string>()
      const hintedRelayUrls = new Set<string>()

      requestById.forEach(({ event, relayUrls }, noteId) => {
        const oldStats = this.noteStatsMap.get(noteId)
        if (oldStats?.updatedAt) {
          idSinceMap.set(noteId, oldStats.updatedAt)
        }

        authors.add(event.pubkey)
        eventIds.add(event.id)
        client.getSeenEventRelayUrls(event.id).forEach((relayUrl) => seenRelayUrls.add(relayUrl))
        relayUrls?.forEach((relayUrl) => hintedRelayUrls.add(relayUrl))

        if (isReplaceableEvent(event.kind)) {
          replaceableCoordinates.add(getReplaceableCoordinateFromEvent(event))
        }
      })

      let relayLists: { read: string[]; write: string[] }[] = []
      try {
        relayLists = await Promise.race([
          client.fetchRelayLists(Array.from(authors)),
          new Promise<{ read: string[]; write: string[] }[]>((resolve) => {
            setTimeout(() => resolve([]), NOTE_STATS_RELAY_LIST_TIMEOUT_MS)
          })
        ])
      } catch {
        relayLists = []
      }

      const relayUrls = pickNoteStatsRelayUrls(
        relayLists,
        Array.from(seenRelayUrls),
        Array.from(hintedRelayUrls)
      )
      const filters = buildNoteStatsBatchFilters(eventIds, replaceableCoordinates, idSinceMap)

      if (filters.length && relayUrls.length) {
        await client.fetchEvents(relayUrls, filters, {
          onevent: (evt) => {
            this.updateNoteStatsByEvents([evt])
          }
        })
      }

      ids.forEach((id) => {
        this.noteStatsMap.set(id, {
          ...(this.noteStatsMap.get(id) ?? {}),
          updatedAt: now
        })
        this.schedulePersist(id)
        this.pendingResolvers.get(id)?.resolve(this.noteStatsMap.get(id) ?? {})
        this.pendingResolvers.delete(id)
      })
    } catch (error) {
      ids.forEach((id) => {
        this.pendingResolvers.get(id)?.reject(error)
        this.pendingResolvers.delete(id)
      })
    }

    if (this.pendingFetchMap.size) {
      this.scheduleBatchFetch()
    }
  }

  private trackNote(event: Event) {
    const touchedAt = dayjs().unix()
    this.trackedNotes.set(event.id, {
      eventId: event.id,
      replaceableCoordinate: isReplaceableEvent(event.kind)
        ? getReplaceableCoordinateFromEvent(event)
        : undefined,
      touchedAt
    })

    this.scheduleLiveRefresh()
  }

  private scheduleLiveRefresh() {
    if (this.liveRefreshTimer) return
    this.liveRefreshTimer = setTimeout(() => {
      this.liveRefreshTimer = null
      this.refreshLiveSubscription()
    }, 300)
  }

  private refreshLiveSubscription() {
    const now = dayjs().unix()
    const minTouchedAt = now - NOTE_STATS_TRACK_TTL_SECONDS
    const tracked = Array.from(this.trackedNotes.values()).filter((item) => item.touchedAt >= minTouchedAt)

    this.trackedNotes = new Map(tracked.map((item) => [item.eventId, item]))

    this.liveCloser?.()
    this.liveCloser = null

    if (!tracked.length) return

    const ids = tracked.map((item) => item.eventId)
    const coordinates = tracked
      .map((item) => item.replaceableCoordinate)
      .filter((item): item is string => !!item)
    const relayUrls = getLiveNoteStatsRelayUrls(ids, (eventId) => client.getSeenEventRelayUrls(eventId))
    if (!relayUrls.length) return

    const filters: Filter[] = []
    filters.push({
      '#e': ids,
      kinds: [kinds.Reaction, kinds.Repost, kinds.Zap, kinds.EventDeletion],
      since: now
    })

    if (coordinates.length) {
      filters.push({
        '#a': coordinates,
        kinds: [kinds.Reaction, kinds.Repost, kinds.Zap],
        since: now
      })
    }

    const sub = client.subscribe(relayUrls, filters, {
      onevent: (evt) => {
        this.updateNoteStatsByEvents([evt])
      }
    })

    this.liveCloser = () => sub.close()
  }

  private removeInteractionsByDeletionEvent(evt: Event): Set<string> {
    const updatedEventIds = new Set<string>()
    const deletedIds = evt.tags.filter(tagNameEquals('e')).map(([, id]) => id)

    deletedIds.forEach((deletedId) => {
      const updatedEventId = this.removeInteractionByIdInternal(deletedId)
      if (updatedEventId) {
        updatedEventIds.add(updatedEventId)
      }
    })

    return updatedEventIds
  }

  private removeInteractionByIdInternal(interactionId: string) {
    const interactionMeta = this.interactionMetaById.get(interactionId)
    if (!interactionMeta) return

    const old = this.noteStatsMap.get(interactionMeta.targetEventId)
    if (!old) return

    if (interactionMeta.type === 'reaction') {
      const likeIdSet = old.likeIdSet ? new Set(old.likeIdSet) : new Set<string>()
      const likes = old.likes ? [...old.likes] : []
      if (!likeIdSet.has(interactionId)) return

      likeIdSet.delete(interactionId)
      const nextLikes = likes.filter((like) => like.id !== interactionId)
      this.noteStatsMap.set(interactionMeta.targetEventId, { ...old, likeIdSet, likes: nextLikes })
    } else if (interactionMeta.type === 'repost') {
      const repostPubkeySet = old.repostPubkeySet ? new Set(old.repostPubkeySet) : new Set<string>()
      const reposts = old.reposts ? [...old.reposts] : []

      repostPubkeySet.delete(interactionMeta.pubkey)
      const nextReposts = reposts.filter((repost) => repost.id !== interactionId)
      this.noteStatsMap.set(interactionMeta.targetEventId, {
        ...old,
        repostPubkeySet,
        reposts: nextReposts
      })
    } else if (interactionMeta.type === 'zap') {
      const zapPrSet = old.zapPrSet ? new Set(old.zapPrSet) : new Set<string>()
      const zaps = old.zaps ? [...old.zaps] : []

      zapPrSet.delete(interactionMeta.pr)
      const nextZaps = zaps.filter((zap) => zap.pr !== interactionMeta.pr)
      this.noteStatsMap.set(interactionMeta.targetEventId, { ...old, zapPrSet, zaps: nextZaps })
    }

    this.interactionMetaById.delete(interactionId)
    return interactionMeta.targetEventId
  }

  private async hydrateNoteStatsFromDb(noteIds: string[], notify: boolean = false) {
    const idsToHydrate = noteIds.filter((id) => !this.hydratedFromDbIds.has(id))
    if (!idsToHydrate.length) return

    idsToHydrate.forEach((id) => this.hydratedFromDbIds.add(id))

    try {
      const cachedMap = await indexedDb.getManyNoteStats(idsToHydrate)
      cachedMap.forEach((cached, id) => {
        const deserialized = deserializeNoteStats(cached)
        const existing = this.noteStatsMap.get(id)
        if ((existing?.updatedAt ?? 0) >= (deserialized.updatedAt ?? 0)) return

        this.noteStatsMap.set(id, deserialized)
        this.rebuildInteractionMeta(id, deserialized)
        if (notify) {
          this.notifyNoteStats(id)
        }
      })
    } catch {
      // ignore cache errors
    }
  }

  private schedulePersist(eventId: string) {
    this.pendingPersistIds.add(eventId)
    if (this.persistTimer) return

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.flushPersist()
    }, NOTE_STATS_PERSIST_DEBOUNCE_MS)
  }

  private async flushPersist() {
    const ids = Array.from(this.pendingPersistIds)
    this.pendingPersistIds.clear()
    if (!ids.length) return

    const entries = ids
      .map((eventId) => {
        const stats = this.noteStatsMap.get(eventId)
        if (!stats) return null
        return { eventId, noteStats: serializeNoteStats(stats) }
      })
      .filter(
        (
          entry
        ): entry is {
          eventId: string
          noteStats: TSerializedNoteStats
        } => !!entry
      )

    if (!entries.length) return

    try {
      await indexedDb.putManyNoteStats(entries)
    } catch {
      // ignore cache errors
    }

    if (this.pendingPersistIds.size) {
      this.schedulePersist(Array.from(this.pendingPersistIds)[0])
    }
  }

  private rebuildInteractionMeta(noteId: string, noteStats: Partial<TNoteStats>) {
    noteStats.likes?.forEach((like) => {
      this.interactionMetaById.set(like.id, {
        type: 'reaction',
        targetEventId: noteId,
        pubkey: like.pubkey
      })
    })

    noteStats.reposts?.forEach((repost) => {
      this.interactionMetaById.set(repost.id, {
        type: 'repost',
        targetEventId: noteId,
        pubkey: repost.pubkey
      })
    })
  }
}

const instance = new NoteStatsService()

export default instance
