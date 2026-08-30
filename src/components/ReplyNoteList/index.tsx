import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { Button } from '@/components/ui/button'
import {
  getParentETag,
  getReplaceableCoordinateFromEvent,
  getRootATag,
  getRootETag,
  getRootEventHexId,
  hasExcessiveHashtags,
  hasExcessiveMentions,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent
} from '@/lib/event'
import { partitionReplySpam, reconcileSpamRepliesExpansionScope } from '@/lib/reply-spam'
import { toNote } from '@/lib/link'
import { generateBech32IdFromETag, tagNameEquals } from '@/lib/tag'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useFollowList } from '@/providers/FollowListProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useSpamFilter } from '@/providers/SpamFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { usePinnedReplies } from '@/providers/PinnedRepliesProvider'
import client from '@/services/client.service'
import nspamService from '@/services/nspam.service'
import { ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { Filter, Event as NEvent, kinds } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingBar } from '../LoadingBar'
import ReplyNote, { ReplyNoteSkeleton } from '../ReplyNote'

type TRootInfo =
  | { type: 'E'; id: string; pubkey: string }
  | { type: 'A'; id: string; eventId: string; pubkey: string; relay?: string }
  | { type: 'I'; id: string }

const LIMIT = 100
const SHOW_COUNT = 10

export default function ReplyNoteList({ index, event }: { index?: number; event: NEvent }) {
  const { t } = useTranslation()
  const { push, currentIndex } = useSecondaryPage()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const { pubkey } = useNostr()
  const { followings } = useFollowList()
  const {
    enabled: spamFilterEnabled,
    markedPubkeys,
    safelistedPubkeys,
    personalizationSignature,
    markNotSpam
  } = useSpamFilter()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers, maxHashtags, maxMentions } = useContentPolicy()
  const [rootInfo, setRootInfo] = useState<TRootInfo | undefined>(undefined)
  const { repliesMap, addReplies } = useReply()
  const { getPinnedReplies } = usePinnedReplies()
  const followedPubkeys = useMemo(
    () => new Set(followings.map((following) => following.trim().toLowerCase())),
    [followings]
  )
  const replies = useMemo(() => {
    const replyIdSet = new Set<string>()
    const replyEvents: NEvent[] = []
    const currentEventKey = isReplaceableEvent(event.kind)
      ? getReplaceableCoordinateFromEvent(event)
      : event.id
    let parentEventKeys = [currentEventKey]
    while (parentEventKeys.length > 0) {
      const events = parentEventKeys.flatMap((id) => repliesMap.get(id)?.events || [])
      events.forEach((evt) => {
        if (replyIdSet.has(evt.id)) return
        if (mutePubkeySet.has(evt.pubkey)) return
        if (hideContentMentioningMutedUsers && isMentioningMutedUsers(evt, mutePubkeySet)) return
        if (hasExcessiveHashtags(evt, maxHashtags)) return
        if (hasExcessiveMentions(evt, maxMentions)) return

        replyIdSet.add(evt.id)
        replyEvents.push(evt)
      })
      parentEventKeys = events.map((evt) => evt.id)
    }
    return replyEvents.sort((a, b) => a.created_at - b.created_at)
  }, [
    event.id,
    repliesMap,
    mutePubkeySet,
    hideContentMentioningMutedUsers,
    maxHashtags,
    maxMentions
  ])

  // Separate pinned and unpinned replies
  const isVisibleReply = useCallback(
    (reply: NEvent) => {
      if (!hideUntrustedInteractions) {
        return true
      }
      if (isUserTrustedForInteractions(reply.pubkey)) {
        return true
      }

      const repliesForThisReply = repliesMap.get(reply.id)
      return !!repliesForThisReply?.events.some((evt) => isUserTrustedForInteractions(evt.pubkey))
    },
    [hideUntrustedInteractions, isUserTrustedForInteractions, repliesMap]
  )

  const trustVisibleReplies = useMemo(
    () => replies.filter(isVisibleReply),
    [replies, isVisibleReply]
  )
  const [spamScoreRevision, setSpamScoreRevision] = useState(0)
  const spamPartition = useMemo(() => {
    void spamScoreRevision
    return partitionReplySpam(trustVisibleReplies, {
      currentPubkey: pubkey,
      enabled: spamFilterEnabled,
      followedPubkeys,
      markedPubkeys,
      safelistedPubkeys,
      signature: personalizationSignature,
      cachedScore: (authorPubkey, signature) => nspamService.cachedScore(authorPubkey, signature)
    })
  }, [
    trustVisibleReplies,
    pubkey,
    spamFilterEnabled,
    followedPubkeys,
    markedPubkeys,
    safelistedPubkeys,
    personalizationSignature,
    spamScoreRevision
  ])
  const pendingSpamWorkKey = spamPartition.pendingPubkeys
    .map((authorPubkey) => `${authorPubkey}:${nspamService.noteRevision(authorPubkey)}`)
    .join('|')
  const spamScoringGenerationRef = useRef(0)
  const spamRetryAttemptRef = useRef(0)
  const [spamRetryNonce, setSpamRetryNonce] = useState(0)
  const [spamScoringError, setSpamScoringError] = useState(false)

  useEffect(() => {
    spamRetryAttemptRef.current = 0
    setSpamScoringError(false)
  }, [pendingSpamWorkKey, personalizationSignature])

  useEffect(() => {
    const generation = ++spamScoringGenerationRef.current
    if (spamPartition.pendingPubkeys.length === 0) return

    const controller = new AbortController()
    let retryTimer: number | undefined
    setSpamScoringError(false)
    const personalization = {
      markedPubkeys,
      safelistedPubkeys,
      signature: personalizationSignature
    }
    void Promise.allSettled(
      spamPartition.pendingPubkeys.map((authorPubkey) =>
        nspamService.scoreAuthor(authorPubkey, personalization, controller.signal)
      )
    ).then((results) => {
      if (controller.signal.aborted || spamScoringGenerationRef.current !== generation) return
      setSpamScoreRevision((revision) => revision + 1)

      const failed = results.some(
        (result) =>
          result.status === 'rejected' &&
          (result.reason as Error | undefined)?.name !== 'AbortError'
      )
      if (!failed) {
        spamRetryAttemptRef.current = 0
        setSpamScoringError(false)
        return
      }

      setSpamScoringError(true)
      if (spamRetryAttemptRef.current < 2) {
        const retryDelay = 1_000 * 2 ** spamRetryAttemptRef.current
        spamRetryAttemptRef.current += 1
        retryTimer = window.setTimeout(() => {
          setSpamRetryNonce((nonce) => nonce + 1)
        }, retryDelay)
      }
    })

    return () => {
      controller.abort()
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [
    pendingSpamWorkKey,
    personalizationSignature,
    markedPubkeys,
    safelistedPubkeys,
    spamRetryNonce
  ])

  const { pinnedReplies, unpinnedReplies } = useMemo(() => {
    const threadId = event.id // Use the current event as the thread ID
    const pinnedIds = new Set(getPinnedReplies(threadId))

    const pinned: NEvent[] = []
    const unpinned: NEvent[] = []

    spamPartition.visible.forEach((reply) => {
      if (pinnedIds.has(reply.id)) {
        pinned.push(reply)
      } else {
        unpinned.push(reply)
      }
    })

    return { pinnedReplies: pinned, unpinnedReplies: unpinned }
  }, [spamPartition.visible, event.id, getPinnedReplies])
  const spamRepliesExpansionScope = `${event.id}\u001d${pubkey ?? ''}\u001d${personalizationSignature}`
  const [expandedSpamRepliesScope, setExpandedSpamRepliesScope] = useState<string>()
  const isSpamRepliesExpanded = expandedSpamRepliesScope === spamRepliesExpansionScope

  useEffect(() => {
    setExpandedSpamRepliesScope((expandedScope) =>
      reconcileSpamRepliesExpansionScope(
        expandedScope,
        spamRepliesExpansionScope,
        spamPartition.hidden.length
      )
    )
  }, [spamPartition.hidden.length, spamRepliesExpansionScope])
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [until, setUntil] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [highlightReplyId, setHighlightReplyId] = useState<string | undefined>(undefined)
  const replyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const fetchRootEvent = async () => {
      let root: TRootInfo = isReplaceableEvent(event.kind)
        ? {
            type: 'A',
            id: getReplaceableCoordinateFromEvent(event),
            eventId: event.id,
            pubkey: event.pubkey,
            relay: client.getEventHint(event.id)
          }
        : { type: 'E', id: event.id, pubkey: event.pubkey }
      const rootETag = getRootETag(event)
      if (rootETag) {
        const [, rootEventHexId, , , rootEventPubkey] = rootETag
        if (rootEventHexId && rootEventPubkey) {
          root = { type: 'E', id: rootEventHexId, pubkey: rootEventPubkey }
        } else {
          const rootEventId = generateBech32IdFromETag(rootETag)
          if (rootEventId) {
            const rootEvent = await client.fetchEvent(rootEventId)
            if (rootEvent) {
              root = { type: 'E', id: rootEvent.id, pubkey: rootEvent.pubkey }
            }
          }
        }
      } else if (event.kind === ExtendedKind.COMMENT) {
        const rootATag = getRootATag(event)
        if (rootATag) {
          const [, coordinate, relay] = rootATag
          const [, pubkey] = coordinate.split(':')
          root = { type: 'A', id: coordinate, eventId: event.id, pubkey, relay }
        }
        const rootITag = event.tags.find(tagNameEquals('I'))
        if (rootITag) {
          root = { type: 'I', id: rootITag[1] }
        }
      }
      setRootInfo(root)
    }
    fetchRootEvent()
  }, [event])

  const onNewReply = useCallback((evt: NEvent) => {
    addReplies([evt])
  }, [])

  useEffect(() => {
    if (!rootInfo) return
    const handleEventPublished = (data: Event) => {
      const customEvent = data as CustomEvent<NEvent>
      const evt = customEvent.detail
      const rootId = getRootEventHexId(evt)
      if (rootId === rootInfo.id && isReplyNoteEvent(evt)) {
        onNewReply(evt)
      }
    }

    client.addEventListener('newEvent', handleEventPublished)
    return () => {
      client.removeEventListener('newEvent', handleEventPublished)
    }
  }, [rootInfo, onNewReply])

  useEffect(() => {
    if (loading || !rootInfo || currentIndex !== index) return

    const init = async () => {
      setLoading(true)

      try {
        const seenOn =
          rootInfo.type === 'E'
            ? client.getSeenEventRelayUrls(rootInfo.id)
            : rootInfo.type === 'A'
              ? client.getSeenEventRelayUrls(rootInfo.eventId)
              : []
        if (rootInfo.type === 'A' && rootInfo.relay) {
          seenOn.unshift(rootInfo.relay)
        }
        const relayUrls = await client.resolveAuthorOutboxRelayUrls(
          [(rootInfo as { pubkey?: string }).pubkey ?? event.pubkey],
          {
            authorRelayLimit: 6,
            maxRelayCount: 10,
            relayHintsByPubkey: new Map([
              [(rootInfo as { pubkey?: string }).pubkey ?? event.pubkey, seenOn]
            ])
          }
        )

        const filters: (Omit<Filter, 'since' | 'until'> & {
          limit: number
        })[] = []
        if (rootInfo.type === 'E') {
          filters.push({
            '#e': [rootInfo.id],
            kinds: [kinds.ShortTextNote],
            limit: LIMIT
          })
          if (event.kind !== kinds.ShortTextNote) {
            filters.push({
              '#E': [rootInfo.id],
              kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
              limit: LIMIT
            })
          }
        } else if (rootInfo.type === 'A') {
          filters.push(
            {
              '#a': [rootInfo.id],
              kinds: [kinds.ShortTextNote],
              limit: LIMIT
            },
            {
              '#A': [rootInfo.id],
              kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
              limit: LIMIT
            }
          )
          if (rootInfo.relay) {
            relayUrls.push(rootInfo.relay)
          }
        } else {
          filters.push({
            '#I': [rootInfo.id],
            kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
            limit: LIMIT
          })
        }
        const { closer, timelineKey } = await client.subscribeTimeline(
          filters.map((filter) => ({
            urls: relayUrls.slice(0, 5),
            filter
          })),
          {
            onEvents: (evts, eosed) => {
              if (evts.length > 0) {
                addReplies(evts.filter((evt) => isReplyNoteEvent(evt)))
              }
              if (eosed) {
                setUntil(evts.length >= LIMIT ? evts[evts.length - 1].created_at - 1 : undefined)
                setLoading(false)
              }
            },
            onNew: (evt) => {
              if (!isReplyNoteEvent(evt)) return
              addReplies([evt])
            }
          }
        )
        setTimelineKey(timelineKey)
        return closer
      } catch {
        setLoading(false)
      }
      return
    }

    const promise = init()
    return () => {
      promise.then((closer) => closer?.())
    }
  }, [rootInfo, currentIndex, index, onNewReply])

  useEffect(() => {
    if (replies.length === 0) {
      loadMore()
    }
  }, [replies])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && showCount < unpinnedReplies.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
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
  }, [unpinnedReplies, showCount])

  const loadMore = useCallback(async () => {
    if (loading || !until || !timelineKey) return

    setLoading(true)
    const events = await client.loadMoreTimeline(timelineKey, until, LIMIT)
    const olderEvents = events.filter((evt) => isReplyNoteEvent(evt))
    if (olderEvents.length > 0) {
      addReplies(olderEvents)
    }
    setUntil(events.length ? events[events.length - 1].created_at - 1 : undefined)
    setLoading(false)
  }, [loading, until, timelineKey])

  const highlightReply = useCallback((eventId: string, scrollTo = true) => {
    if (scrollTo) {
      const ref = replyRefs.current[eventId]
      if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
    setHighlightReplyId(eventId)
    setTimeout(() => {
      setHighlightReplyId((pre) => (pre === eventId ? undefined : pre))
    }, 1500)
  }, [])

  return (
    <div className="min-h-[80vh]">
      {loading && <LoadingBar />}
      {!loading && until && until > event.created_at && (
        <div
          className={`text-sm text-center text-muted-foreground border-b py-2 ${!loading ? 'hover:text-foreground cursor-pointer' : ''}`}
          onClick={loadMore}
        >
          {t('load more older replies')}
        </div>
      )}
      <div>
        {/* Render pinned replies first */}
        {pinnedReplies.map((reply) => {
          const parentETag = getParentETag(reply)
          const parentEventHexId = parentETag?.[1]
          const parentEventId = parentETag ? generateBech32IdFromETag(parentETag) : undefined
          return (
            <div
              ref={(el) => (replyRefs.current[reply.id] = el)}
              key={reply.id}
              className="scroll-mt-12"
            >
              <ReplyNote
                event={reply}
                parentEventId={event.id !== parentEventHexId ? parentEventId : undefined}
                onClickParent={() => {
                  if (!parentEventHexId) return
                  if (replies.every((r) => r.id !== parentEventHexId)) {
                    push(toNote(parentEventId ?? parentEventHexId))
                    return
                  }
                  highlightReply(parentEventHexId)
                }}
                highlight={highlightReplyId === reply.id}
                isPinned={true}
              />
            </div>
          )
        })}

        {/* Render unpinned replies with pagination */}
        {unpinnedReplies.slice(0, showCount).map((reply) => {
          const parentETag = getParentETag(reply)
          const parentEventHexId = parentETag?.[1]
          const parentEventId = parentETag ? generateBech32IdFromETag(parentETag) : undefined
          return (
            <div
              ref={(el) => (replyRefs.current[reply.id] = el)}
              key={reply.id}
              className="scroll-mt-12"
            >
              <ReplyNote
                event={reply}
                parentEventId={event.id !== parentEventHexId ? parentEventId : undefined}
                onClickParent={() => {
                  if (!parentEventHexId) return
                  if (replies.every((r) => r.id !== parentEventHexId)) {
                    push(toNote(parentEventId ?? parentEventHexId))
                    return
                  }
                  highlightReply(parentEventHexId)
                }}
                highlight={highlightReplyId === reply.id}
                isPinned={false}
              />
            </div>
          )
        })}

        {spamPartition.pending.length > 0 && (
          <section
            className="flex items-center gap-3 border-b bg-muted/10 px-4 py-3"
            aria-live="polite"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {spamScoringError ? (
                <ShieldAlert className="size-4" aria-hidden="true" />
              ) : (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {spamScoringError
                  ? t('Spam check unavailable', { defaultValue: 'Spam check unavailable' })
                  : t('Checking replies', { defaultValue: 'Checking replies' })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {spamScoringError
                  ? spamPartition.pending.length === 1
                    ? t('1 reply remains hidden until the check succeeds.', {
                        defaultValue: '1 reply remains hidden until the check succeeds.'
                      })
                    : t('{{count}} replies remain hidden until the check succeeds.', {
                        count: spamPartition.pending.length,
                        defaultValue: '{{count}} replies remain hidden until the check succeeds.'
                      })
                  : spamPartition.pending.length === 1
                    ? t('Checking 1 reply before showing it.', {
                        defaultValue: 'Checking 1 reply before showing it.'
                      })
                    : t('Checking {{count}} replies before showing them.', {
                        count: spamPartition.pending.length,
                        defaultValue: 'Checking {{count}} replies before showing them.'
                      })}
              </span>
            </span>
            {spamScoringError && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-10 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  spamRetryAttemptRef.current = 0
                  setSpamScoringError(false)
                  setSpamRetryNonce((nonce) => nonce + 1)
                }}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t('Retry', { defaultValue: 'Retry' })}
              </Button>
            )}
          </section>
        )}

        {spamPartition.hidden.length > 0 && (
          <section className="border-b bg-muted/20" aria-label={t('Might be spam')}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() =>
                setExpandedSpamRepliesScope((expandedScope) =>
                  expandedScope === spamRepliesExpansionScope
                    ? undefined
                    : spamRepliesExpansionScope
                )
              }
              aria-expanded={isSpamRepliesExpanded}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {t('Might be spam', { defaultValue: 'Might be spam' })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {spamPartition.hidden.length === 1
                    ? t('{{count}} hidden reply from a likely spam account', {
                        count: spamPartition.hidden.length,
                        defaultValue: '{{count}} hidden reply from a likely spam account'
                      })
                    : t('{{count}} hidden replies from likely spam accounts', {
                        count: spamPartition.hidden.length,
                        defaultValue: '{{count}} hidden replies from likely spam accounts'
                      })}
                </span>
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {isSpamRepliesExpanded
                  ? t('Hide', { defaultValue: 'Hide' })
                  : t('Show', { defaultValue: 'Show' })}
              </span>
              {isSpamRepliesExpanded ? (
                <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {isSpamRepliesExpanded && (
              <div className="border-t bg-background">
                {spamPartition.hidden.map((reply) => {
                  const parentETag = getParentETag(reply)
                  const parentEventHexId = parentETag?.[1]
                  const parentEventId = parentETag
                    ? generateBech32IdFromETag(parentETag)
                    : undefined
                  return (
                    <div key={reply.id} className="border-b last:border-b-0">
                      <div
                        ref={(el) => (replyRefs.current[reply.id] = el)}
                        className="scroll-mt-12"
                      >
                        <ReplyNote
                          event={reply}
                          parentEventId={event.id !== parentEventHexId ? parentEventId : undefined}
                          onClickParent={() => {
                            if (!parentEventHexId) return
                            if (replies.every((candidate) => candidate.id !== parentEventHexId)) {
                              push(toNote(parentEventId ?? parentEventHexId))
                              return
                            }
                            highlightReply(parentEventHexId)
                          }}
                          highlight={highlightReplyId === reply.id}
                          isPinned={false}
                        />
                      </div>
                      <div className="flex justify-end px-4 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-10 text-muted-foreground hover:text-foreground"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            markNotSpam(reply.pubkey)
                          }}
                        >
                          {t('Not spam', { defaultValue: 'Not spam' })}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
      {!loading && (
        <div className="text-sm mt-2 mb-3 text-center text-muted-foreground">
          {replies.length > 0 ? t('no more replies') : t('no replies')}
        </div>
      )}
      <div ref={bottomRef} />
      {loading && <ReplyNoteSkeleton />}
    </div>
  )
}
