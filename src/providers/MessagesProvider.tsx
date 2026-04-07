import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { Event, getEventHash, kinds } from 'nostr-tools'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useFollowList } from './FollowListProvider'
import { useNostr } from '@/providers/NostrProvider'
import {
  buildConversations,
  dedupeWrappedEvents,
  mergeMessages,
  mergeReactions
} from './messages/conversations'
import {
  isDirectMessageEvent,
  isDirectMessageReactionEvent,
  unwrapDirectMessage,
  type TConversationEvent
} from './messages/decrypt'
import {
  buildWrappedRumorEvents as createWrappedRumorEvents,
  publishWrappedRumorEvents
} from './messages/publish'
import {
  type TDirectMessage,
  type TDirectMessageReaction,
  type TMessageConversation
} from './messages/types'
import { toConversationId } from './messages/shared'
import { debugDm, warnDm } from './messages/debug'
export type {
  TDirectMessage,
  TDirectMessageReaction,
  TMessageConversation
} from './messages/types'

type TMessagesContext = {
  conversations: TMessageConversation[]
  activeConversations: TMessageConversation[]
  requests: TMessageConversation[]
  hasUnreadMessages: boolean
  unreadMessageCount: number
  unreadConversationCount: number
  messagesReadAt: number
  isLoading: boolean
  hasLoadedMessages: boolean
  error: string | null
  isSupported: boolean
  markAllAsRead: () => void
  markConversationAsRead: (conversationId: string) => void
  dismissConversation: (conversationId: string) => void
  sendMessage: (
    recipientPubkeys: string[],
    content: string,
    options?: {
      replyToId?: string
      subject?: string
      additionalTags?: string[][]
      kind?: number
    }
  ) => Promise<void>
  sendReaction: (
    recipientPubkeys: string[],
    targetMessage: TDirectMessage,
    emoji: string
  ) => Promise<void>
}

const MessagesContext = createContext<TMessagesContext | undefined>(undefined)

// Gift-wrap created_at is intentionally randomized, so a single "latest" slice can hide
// real recent messages behind older-looking wraps. We backfill multiple pages instead.
const MESSAGE_BACKFILL_PAGE_LIMIT = 200
const MESSAGE_BACKFILL_MAX_PAGES = 8
const MESSAGE_SUBSCRIPTION_REPLAY_LIMIT = 200
const MESSAGE_LOOKUP_READ_RELAYS = 4
const MESSAGE_LOOKUP_WRITE_RELAYS = 2
const MESSAGE_DECRYPT_BATCH_SIZE = 24
const MESSAGE_DECRYPT_TIMEOUT_MS = 8_000
const MESSAGE_INITIAL_QUERY_TIMEOUT_MS = 12_000
const MESSAGE_BACKFILL_QUERY_TIMEOUT_MS = 8_000

export const useMessages = () => {
  const context = useContext(MessagesContext)
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider')
  }
  return context
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const {
    pubkey,
    account,
    relayList,
    inboxRelayUrls,
    nip44Supported,
    nip44Decrypt,
    nip44Encrypt,
    signEvent
  } = useNostr()
  const { followings } = useFollowList()
  const [messages, setMessages] = useState<TDirectMessage[]>([])
  const [reactions, setReactions] = useState<TDirectMessageReaction[]>([])
  const [messagesReadAt, setMessagesReadAt] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationReadAtMap, setConversationReadAtMap] = useState<Record<string, number>>({})
  const [dismissedConversationMap, setDismissedConversationMap] = useState<Record<string, number>>(
    {}
  )
  const [resolvedInboxRelayUrls, setResolvedInboxRelayUrls] = useState<string[]>([])
  const decryptRef = useRef(nip44Decrypt)
  const decryptedMessageCacheRef = useRef(new Map<string, TConversationEvent | null>())

  useEffect(() => {
    decryptRef.current = nip44Decrypt
    decryptedMessageCacheRef.current.clear()
  }, [nip44Decrypt])

  useEffect(() => {
    decryptedMessageCacheRef.current.clear()
  }, [pubkey])

  useEffect(() => {
    setResolvedInboxRelayUrls([])
  }, [pubkey])

  useEffect(() => {
    if (inboxRelayUrls.length === 0) {
      return
    }

    setResolvedInboxRelayUrls(Array.from(new Set(inboxRelayUrls)))
  }, [inboxRelayUrls])

  const unwrapDirectMessageWithCache = useCallback(
    (wrap: Event) => {
      if (!pubkey) {
        return Promise.resolve(null)
      }

      return unwrapDirectMessage(wrap, pubkey, decryptRef.current, decryptedMessageCacheRef.current)
    },
    [pubkey]
  )

  const unwrapDirectMessageWithTimeout = useCallback(
    async (wrap: Event) => {
      const timeoutToken = Symbol('dm-decrypt-timeout')
      let timeoutId: number | undefined

      try {
        const result = await Promise.race([
          unwrapDirectMessageWithCache(wrap),
          new Promise<typeof timeoutToken>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(timeoutToken), MESSAGE_DECRYPT_TIMEOUT_MS)
          })
        ])

        if (result === timeoutToken) {
          warnDm('Timed out while decrypting DM gift wrap', {
            wrapId: wrap.id,
            timeoutMs: MESSAGE_DECRYPT_TIMEOUT_MS
          })
          return null
        }

        return result
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId)
        }
      }
    },
    [unwrapDirectMessageWithCache]
  )

  const publishedInboxRelayUrls = useMemo(() => {
    return Array.from(
      new Set(resolvedInboxRelayUrls.length > 0 ? resolvedInboxRelayUrls : inboxRelayUrls)
    )
  }, [inboxRelayUrls, resolvedInboxRelayUrls])
  const publishedInboxRelayUrlsKey = publishedInboxRelayUrls.join('|')

  const ensurePublishedInboxRelayUrls = useCallback(async () => {
    if (!pubkey) {
      return []
    }

    if (publishedInboxRelayUrls.length > 0) {
      return publishedInboxRelayUrls
    }

    debugDm('Refreshing published inbox relay list because local state is empty', {
      pubkey
    })

    const refreshedInboxRelayUrls = await client
      .fetchInboxRelayList(pubkey, { refreshIfEmpty: true })
      .catch((refreshError) => {
        warnDm('Failed to refresh published inbox relay list', {
          pubkey,
          error: refreshError instanceof Error ? refreshError.message : String(refreshError)
        })
        return []
      })

    setResolvedInboxRelayUrls(refreshedInboxRelayUrls)

    debugDm('Resolved published inbox relay list', {
      pubkey,
      relayUrls: refreshedInboxRelayUrls
    })

    return refreshedInboxRelayUrls
  }, [pubkey, publishedInboxRelayUrlsKey])

  const messageLookupRelayUrls = useMemo(() => {
    return Array.from(
      new Set(
        publishedInboxRelayUrls
          .concat(relayList?.read.slice(0, MESSAGE_LOOKUP_READ_RELAYS) ?? [])
          .concat(relayList?.write.slice(0, MESSAGE_LOOKUP_WRITE_RELAYS) ?? [])
      )
    )
  }, [publishedInboxRelayUrls, relayList])

  const isSupported = !!pubkey && account?.signerType !== 'npub' && nip44Supported

  useEffect(() => {
    if (
      !pubkey ||
      account?.signerType === 'npub' ||
      !nip44Supported ||
      publishedInboxRelayUrls.length > 0
    ) {
      return
    }

    let isCancelled = false

    void ensurePublishedInboxRelayUrls().then((relayUrls) => {
      if (isCancelled || relayUrls.length > 0) {
        return
      }

      warnDm('Inbox relay refresh still returned no relays for the active account', {
        pubkey
      })
    })

    return () => {
      isCancelled = true
    }
  }, [
    account?.signerType,
    ensurePublishedInboxRelayUrls,
    nip44Supported,
    pubkey,
    publishedInboxRelayUrls.length
  ])

  useEffect(() => {
    if (!pubkey) {
      debugDm('Resetting DM state because there is no active pubkey')
      setMessages([])
      setReactions([])
      setMessagesReadAt(0)
      setConversationReadAtMap({})
      setDismissedConversationMap({})
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError(null)
      return
    }

    setMessagesReadAt(storage.getLastReadMessageTime(pubkey))
    setConversationReadAtMap(storage.getMessageConversationReadTimeMap(pubkey))
    setDismissedConversationMap(storage.getDismissedMessageConversationMap(pubkey))
    setMessages([])
    setReactions([])
    setHasLoadedMessages(false)
    setError(null)

    debugDm('Starting DM sync', {
      pubkey,
      signerType: account?.signerType,
      nip44Supported,
      publishedInboxRelayUrls,
      messageLookupRelayUrls
    })

    if (account?.signerType === 'npub') {
      warnDm('DM sync unavailable because the active account is npub-only', {
        pubkey
      })
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages require a signer that can decrypt NIP-17 messages.')
      return
    }
    if (!nip44Supported) {
      warnDm('DM sync unavailable because the signer does not support NIP-44', {
        pubkey,
        signerType: account?.signerType
      })
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages require a signer that supports NIP-44.')
      return
    }
    if (messageLookupRelayUrls.length === 0) {
      warnDm('DM sync unavailable because there are no lookup relays', {
        pubkey,
        publishedInboxRelayUrls
      })
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages need inbox relays or mailbox relays to receive messages.')
      return
    }

    let isMounted = true
    let reconnectTimer: number | undefined
    let subscription: { close: () => void } | null = null

    const applyWrappedEvents = async (wrappedEvents: Event[]) => {
      if (wrappedEvents.length === 0) {
        return 0
      }

      debugDm('Applying DM gift wraps', {
        wrapCount: wrappedEvents.length,
        wrapIds: wrappedEvents.map((wrappedEvent) => wrappedEvent.id)
      })

      let unwrappedCount = 0
      const participantPubkeySet = new Set<string>()

      for (let index = 0; index < wrappedEvents.length; index += MESSAGE_DECRYPT_BATCH_SIZE) {
        const wrappedChunk = wrappedEvents.slice(index, index + MESSAGE_DECRYPT_BATCH_SIZE)
        const unwrappedChunk = (
          await Promise.allSettled(
            wrappedChunk.map((wrappedEvent) => unwrapDirectMessageWithTimeout(wrappedEvent))
          )
        )
          .map((result, resultIndex) => {
            if (result.status === 'fulfilled') {
              return result.value
            }

            warnDm('DM wrap batch failed to decrypt one event', {
              wrapId: wrappedChunk[resultIndex]?.id,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            })
            return null
          })
          .filter((event): event is TConversationEvent => !!event)

        if (unwrappedChunk.length === 0) {
          debugDm('DM wrap batch produced no decryptable events', {
            wrapIds: wrappedChunk.map((wrappedEvent) => wrappedEvent.id)
          })
          continue
        }

        unwrappedCount += unwrappedChunk.length

        unwrappedChunk.forEach((event) => {
          participantPubkeySet.add(event.senderPubkey)
          event.participantPubkeys.forEach((participantPubkey: string) => {
            participantPubkeySet.add(participantPubkey)
          })
        })

        if (!isMounted) {
          continue
        }

        const unwrappedMessages = unwrappedChunk.filter(isDirectMessageEvent)
        const unwrappedReactions = unwrappedChunk.filter(isDirectMessageReactionEvent)

        debugDm('DM wrap batch decrypted successfully', {
          wrapIds: wrappedChunk.map((wrappedEvent) => wrappedEvent.id),
          unwrappedCount: unwrappedChunk.length,
          messageCount: unwrappedMessages.length,
          reactionCount: unwrappedReactions.length
        })

        if (unwrappedMessages.length > 0) {
          setMessages((currentMessages) => mergeMessages(currentMessages, unwrappedMessages))
        }

        if (unwrappedReactions.length > 0) {
          setReactions((currentReactions) => mergeReactions(currentReactions, unwrappedReactions))
        }
      }

      if (participantPubkeySet.size > 0) {
        void client.prefetchProfiles(Array.from(participantPubkeySet))
      }

      return unwrappedCount
    }

    const startSubscription = () => {
      subscription?.close()
      debugDm('Starting DM live subscription', {
        relayUrls: messageLookupRelayUrls,
        pubkey,
        replayLimit: MESSAGE_SUBSCRIPTION_REPLAY_LIMIT
      })
      subscription = client.subscribe(
        messageLookupRelayUrls,
        {
          kinds: [kinds.GiftWrap],
          '#p': [pubkey],
          limit: MESSAGE_SUBSCRIPTION_REPLAY_LIMIT
        },
        {
          onevent: (wrappedEvent) => {
            debugDm('Received live DM wrap from subscription', {
              wrapId: wrappedEvent.id,
              relayHint: wrappedEvent.tags.find(([tagName]) => tagName === 'p')?.[2],
              createdAt: wrappedEvent.created_at
            })
            void applyWrappedEvents([wrappedEvent])
          },
          onAllClose: (reasons) => {
            if (!isMounted || reasons.every((reason) => reason === 'closed by caller')) {
              return
            }

            warnDm('DM live subscription closed', {
              relayUrls: messageLookupRelayUrls,
              reasons
            })
            reconnectTimer = window.setTimeout(() => {
              if (isMounted) {
                startSubscription()
              }
            }, 5_000)
          }
        }
      )
    }

    const loadMessages = async () => {
      setIsLoading(true)
      setError(null)

      try {
        let nextUntil: number | undefined
        let loadedWrapCount = 0
        let unwrappedCount = 0
        const seenWrapIds = new Set<string>()

        for (let pageIndex = 0; pageIndex < MESSAGE_BACKFILL_MAX_PAGES; pageIndex += 1) {
          // Let the first page wait longer for slower inbox relays, but do not allow a single
          // stalled/auth-gated relay to block the entire messages screen forever.
          const wrappedEvents = dedupeWrappedEvents(
            await client.fetchEvents(
              messageLookupRelayUrls,
              {
                kinds: [kinds.GiftWrap],
                '#p': [pubkey],
                limit: MESSAGE_BACKFILL_PAGE_LIMIT,
                ...(nextUntil ? { until: nextUntil } : {})
              },
              {
                timeoutMs:
                  pageIndex === 0
                    ? MESSAGE_INITIAL_QUERY_TIMEOUT_MS
                    : MESSAGE_BACKFILL_QUERY_TIMEOUT_MS
              }
            )
          ).filter((wrappedEvent) => {
            if (seenWrapIds.has(wrappedEvent.id)) {
              return false
            }

            seenWrapIds.add(wrappedEvent.id)
            return true
          })

          debugDm('Fetched DM backfill page', {
            pageIndex,
            until: nextUntil,
            wrapCount: wrappedEvents.length,
            wrapIds: wrappedEvents.slice(0, 10).map((wrappedEvent) => wrappedEvent.id)
          })

          if (!wrappedEvents.length) {
            break
          }

          loadedWrapCount += wrappedEvents.length
          unwrappedCount += await applyWrappedEvents(wrappedEvents)

          const oldestWrappedEvent = wrappedEvents[wrappedEvents.length - 1]
          nextUntil = oldestWrappedEvent.created_at - 1

          if (!Number.isFinite(nextUntil)) {
            break
          }
        }

        if (!isMounted) return

        debugDm('Finished DM backfill', {
          loadedWrapCount,
          unwrappedCount,
          messageCount: messages.length,
          reactionCount: reactions.length
        })

        if (loadedWrapCount > 0 && unwrappedCount === 0) {
          setError('Wrapped messages were found, but they could not be decrypted with this signer.')
        } else {
          setError(null)
        }
      } catch (loadError) {
        warnDm('DM backfill failed', {
          error: loadError instanceof Error ? loadError.message : String(loadError),
          relayUrls: messageLookupRelayUrls
        })
        if (isMounted) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load direct messages.'
          setError(message)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setHasLoadedMessages(true)
          debugDm('DM sync finished initial load', {
            pubkey,
            isLoading: false
          })
          startSubscription()
        }
      }
    }

    void loadMessages()

    return () => {
      isMounted = false
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
      }
      subscription?.close()
    }
  }, [
    account?.signerType,
    messageLookupRelayUrls,
    nip44Supported,
    pubkey,
    unwrapDirectMessageWithTimeout
  ])

  const conversations = useMemo(
    () =>
      buildConversations({
        conversationReadAtMap,
        followings,
        messages,
        messagesReadAt,
        reactions
      }),
    [conversationReadAtMap, followings, messages, messagesReadAt, reactions]
  )

  const visibleConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          (dismissedConversationMap[conversation.id] ?? 0) < conversation.lastMessageAt
      ),
    [conversations, dismissedConversationMap]
  )

  const activeConversations = useMemo(
    () => visibleConversations.filter((conversation) => !conversation.isRequest),
    [visibleConversations]
  )

  const requests = useMemo(
    () => visibleConversations.filter((conversation) => conversation.isRequest),
    [visibleConversations]
  )

  const unreadMessageCount = useMemo(
    () => visibleConversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [visibleConversations]
  )

  const unreadConversationCount = useMemo(
    () => visibleConversations.filter((conversation) => conversation.unreadCount > 0).length,
    [visibleConversations]
  )

  const buildWrappedRumorEvents = useCallback(
    async (rumorEvent: Event, rumorRecipients: string[]) => {
      if (!pubkey) {
        throw new Error('You need to be logged in to send direct messages.')
      }

      const nextPublishedInboxRelayUrls = await ensurePublishedInboxRelayUrls()

      return createWrappedRumorEvents({
        fetchInboxRelayList: (recipientPubkey) =>
          client.fetchInboxRelayList(recipientPubkey, { refreshIfEmpty: true }),
        nip44Encrypt,
        pubkey,
        publishedInboxRelayUrls: nextPublishedInboxRelayUrls,
        rumorEvent,
        rumorRecipients,
        signEvent
      })
    },
    [ensurePublishedInboxRelayUrls, nip44Encrypt, pubkey, signEvent]
  )

  const sendMessage = useCallback(
    async (
      recipientPubkeys: string[],
      content: string,
      options: {
        replyToId?: string
        subject?: string
        additionalTags?: string[][]
        kind?: number
      } = {}
    ) => {
      if (!pubkey || account?.signerType === 'npub' || !nip44Supported) {
        throw new Error('Direct messages require a signer that can encrypt NIP-17 messages.')
      }

      const nextPublishedInboxRelayUrls = await ensurePublishedInboxRelayUrls()
      if (nextPublishedInboxRelayUrls.length === 0) {
        throw new Error('Set up inbox relays before sending direct messages.')
      }

      const trimmedContent = content.trim()
      if (!trimmedContent) {
        throw new Error('Message content cannot be empty.')
      }

      const uniqueRecipients = Array.from(
        new Set(recipientPubkeys.map((recipientPubkey) => recipientPubkey.trim()).filter(Boolean))
      ).filter((recipientPubkey) => recipientPubkey !== pubkey)

      if (uniqueRecipients.length === 0) {
        throw new Error('Choose at least one recipient.')
      }

      const createdAt = Math.ceil(Date.now() / 1000)
      const rumorTags = uniqueRecipients.map((recipientPubkey) => ['p', recipientPubkey])
      const rumorKind =
        options.kind === 15 || options.kind === kinds.PrivateDirectMessage
          ? options.kind
          : kinds.PrivateDirectMessage
      const subject = options.subject?.trim()

      if (options.replyToId) {
        rumorTags.push(['e', options.replyToId, '', 'reply'])
      }

      if (subject) {
        rumorTags.push(['subject', subject])
      }

      if (options.additionalTags?.length) {
        rumorTags.push(...options.additionalTags.map((tag) => tag.slice()))
      }

      const rumor = {
        created_at: createdAt,
        kind: rumorKind,
        content: trimmedContent,
        tags: rumorTags,
        pubkey
      }

      const rumorEvent = {
        ...rumor,
        id: getEventHash(rumor)
      } as Event

      const participantPubkeys = uniqueRecipients.slice().sort()
      const optimisticMessage: TDirectMessage = {
        id: rumorEvent.id,
        wrapId: `optimistic:${rumorEvent.id}`,
        kind: rumorEvent.kind,
        tags: rumorTags,
        content: rumorEvent.content,
        createdAt: rumorEvent.created_at,
        senderPubkey: pubkey,
        recipientPubkeys: uniqueRecipients,
        participantPubkeys,
        conversationId: toConversationId(participantPubkeys),
        subject,
        replyToId: options.replyToId,
        isOutgoing: true
      }

      setMessages((currentMessages) => mergeMessages(currentMessages, [optimisticMessage]))

      void (async () => {
        try {
          const wrappedEvents = await buildWrappedRumorEvents(rumorEvent, uniqueRecipients)

          const selfWrapEvent = wrappedEvents.find(
            ({ recipientPubkey }) => recipientPubkey === pubkey
          )?.wrapEvent
          const confirmedMessage: TDirectMessage = {
            ...optimisticMessage,
            wrapId: selfWrapEvent?.id ?? wrappedEvents[0].wrapEvent.id
          }

          setMessages((currentMessages) => mergeMessages(currentMessages, [confirmedMessage]))

          const results = await publishWrappedRumorEvents(wrappedEvents)

          if (results.some((result) => result.status === 'fulfilled')) {
            return
          }

          toast.error(t('Failed to deliver this message to relays.'))
        } catch (error) {
          setMessages((currentMessages) =>
            currentMessages.filter((message) => message.id !== rumorEvent.id)
          )
          toast.error(error instanceof Error ? error.message : t('Failed to send message'))
        }
      })()
    },
    [account?.signerType, buildWrappedRumorEvents, ensurePublishedInboxRelayUrls, nip44Supported, pubkey, t]
  )

  const sendReaction = useCallback(
    async (recipientPubkeys: string[], targetMessage: TDirectMessage, emoji: string) => {
      if (!pubkey || account?.signerType === 'npub' || !nip44Supported) {
        throw new Error('Direct messages require a signer that can encrypt NIP-17 messages.')
      }
      if (targetMessage.isOutgoing) {
        throw new Error('You can only react to messages from other people.')
      }

      const nextPublishedInboxRelayUrls = await ensurePublishedInboxRelayUrls()
      if (nextPublishedInboxRelayUrls.length === 0) {
        throw new Error('Set up inbox relays before sending direct messages.')
      }

      const normalizedEmoji = emoji.trim() || '+'
      const uniqueRecipients = Array.from(
        new Set(recipientPubkeys.map((recipientPubkey) => recipientPubkey.trim()).filter(Boolean))
      ).filter((recipientPubkey) => recipientPubkey !== pubkey)

      if (uniqueRecipients.length === 0) {
        throw new Error('Choose at least one recipient.')
      }

      const createdAt = Math.ceil(Date.now() / 1000)
      const rumorRecipientPubkeys = Array.from(
        new Set([...uniqueRecipients, targetMessage.senderPubkey].filter(Boolean))
      )
      const rumorTags = rumorRecipientPubkeys.map((recipientPubkey) => ['p', recipientPubkey])
      rumorTags.push(['e', targetMessage.id])
      rumorTags.push(['k', String(targetMessage.kind)])

      const rumor = {
        created_at: createdAt,
        kind: kinds.Reaction,
        content: normalizedEmoji,
        tags: rumorTags,
        pubkey
      }

      const rumorEvent = {
        ...rumor,
        id: getEventHash(rumor)
      } as Event

      const participantPubkeys = Array.from(
        new Set(rumorRecipientPubkeys.filter((recipientPubkey) => recipientPubkey !== pubkey))
      ).sort()
      const optimisticReaction: TDirectMessageReaction = {
        id: rumorEvent.id,
        wrapId: `optimistic:${rumorEvent.id}`,
        createdAt: rumorEvent.created_at,
        senderPubkey: pubkey,
        recipientPubkeys: rumorRecipientPubkeys,
        participantPubkeys,
        conversationId: toConversationId(participantPubkeys),
        isOutgoing: true,
        targetMessageId: targetMessage.id,
        emoji: normalizedEmoji
      }

      setReactions((currentReactions) => mergeReactions(currentReactions, [optimisticReaction]))

      void (async () => {
        try {
          const wrappedEvents = await buildWrappedRumorEvents(rumorEvent, uniqueRecipients)

          const selfWrapEvent = wrappedEvents.find(
            ({ recipientPubkey }) => recipientPubkey === pubkey
          )?.wrapEvent
          const confirmedReaction: TDirectMessageReaction = {
            ...optimisticReaction,
            wrapId: selfWrapEvent?.id ?? wrappedEvents[0].wrapEvent.id
          }

          setReactions((currentReactions) => mergeReactions(currentReactions, [confirmedReaction]))

          const results = await publishWrappedRumorEvents(wrappedEvents)

          if (results.some((result) => result.status === 'fulfilled')) {
            return
          }

          toast.error(t('Failed to deliver this reaction to relays.'))
        } catch (error) {
          setReactions((currentReactions) =>
            currentReactions.filter((reaction) => reaction.id !== rumorEvent.id)
          )
          toast.error(error instanceof Error ? error.message : t('Failed to send reaction'))
        }
      })()
    },
    [account?.signerType, buildWrappedRumorEvents, ensurePublishedInboxRelayUrls, nip44Supported, pubkey, t]
  )

  const markAllAsRead = useCallback(() => {
    if (!pubkey) return

    const latestIncomingMessageAt = messages.reduce((latest, message) => {
      if (message.isOutgoing) {
        return latest
      }
      return Math.max(latest, message.createdAt)
    }, 0)

    const nextMessagesReadAt = Math.max(
      messagesReadAt,
      latestIncomingMessageAt || Math.floor(Date.now() / 1000)
    )
    storage.setLastReadMessageTime(pubkey, nextMessagesReadAt)
    setMessagesReadAt(nextMessagesReadAt)
  }, [messages, messagesReadAt, pubkey])

  const markConversationAsRead = useCallback(
    (conversationId: string) => {
      if (!pubkey) return

      const conversation = conversations.find((item) => item.id === conversationId)
      if (!conversation) return

      const latestIncomingMessageAt = conversation.messages.reduce((latest, message) => {
        if (message.isOutgoing) {
          return latest
        }
        return Math.max(latest, message.createdAt)
      }, 0)

      if (!latestIncomingMessageAt) {
        return
      }

      storage.setMessageConversationReadTime(pubkey, conversationId, latestIncomingMessageAt)
      setConversationReadAtMap((currentMap) => ({
        ...currentMap,
        [conversationId]: latestIncomingMessageAt
      }))
    },
    [conversations, pubkey]
  )

  const dismissConversation = useCallback(
    (conversationId: string) => {
      if (!pubkey) return

      const conversation = conversations.find((item) => item.id === conversationId)
      if (!conversation) return

      const latestIncomingMessageAt = conversation.messages.reduce((latest, message) => {
        if (message.isOutgoing) {
          return latest
        }
        return Math.max(latest, message.createdAt)
      }, 0)

      storage.setDismissedMessageConversationTime(
        pubkey,
        conversationId,
        conversation.lastMessageAt
      )
      setDismissedConversationMap((currentMap) => ({
        ...currentMap,
        [conversationId]: conversation.lastMessageAt
      }))

      if (latestIncomingMessageAt > 0) {
        storage.setMessageConversationReadTime(pubkey, conversationId, latestIncomingMessageAt)
        setConversationReadAtMap((currentMap) => ({
          ...currentMap,
          [conversationId]: latestIncomingMessageAt
        }))
      }
    },
    [conversations, pubkey]
  )

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        activeConversations,
        requests,
        hasUnreadMessages: unreadMessageCount > 0,
        unreadMessageCount,
        unreadConversationCount,
        messagesReadAt,
        isLoading,
        hasLoadedMessages,
        error,
        isSupported,
        markAllAsRead,
        markConversationAsRead,
        dismissConversation,
        sendMessage,
        sendReaction
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}
