import { encrypt as encryptNip44 } from '@/lib/nip44'
import { checkAuthProtectedRelay } from '@/lib/relay'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import relayInfoService from '@/services/relay-info.service'
import {
  Event,
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  kinds,
  validateEvent,
  verifyEvent
} from 'nostr-tools'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useFollowList } from './FollowListProvider'
import { useNostr } from './NostrProvider'

type TConversationEventBase = {
  id: string
  wrapId: string
  createdAt: number
  senderPubkey: string
  recipientPubkeys: string[]
  participantPubkeys: string[]
  conversationId: string
  isOutgoing: boolean
}

export type TDirectMessage = TConversationEventBase & {
  kind: number
  tags: string[][]
  content: string
  subject?: string
  replyToId?: string
}

export type TDirectMessageReaction = TConversationEventBase & {
  targetMessageId: string
  emoji: string
}

type TConversationEvent = TDirectMessage | TDirectMessageReaction

export type TMessageConversation = {
  id: string
  participantPubkeys: string[]
  primaryPubkey?: string
  isGroup: boolean
  isRequest: boolean
  unreadCount: number
  lastMessageAt: number
  lastMessagePreview: string
  subject?: string
  messages: TDirectMessage[]
  reactionsByMessageId: Record<string, TDirectMessageReaction[]>
  hasOutgoingActivity: boolean
}

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
    options?: { replyToId?: string; subject?: string; additionalTags?: string[][] }
  ) => Promise<void>
  sendReaction: (
    recipientPubkeys: string[],
    targetMessage: TDirectMessage,
    emoji: string
  ) => Promise<void>
}

const MessagesContext = createContext<TMessagesContext | undefined>(undefined)

const MESSAGE_FETCH_LIMIT = 250
const RELAY_INFO_LOOKUP_TIMEOUT_MS = 1_500
const TWO_DAYS_IN_SECONDS = 2 * 24 * 60 * 60

function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

function getMessagePreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'Empty message'
  }
  return normalized.length > 120 ? normalized.slice(0, 117) + '...' : normalized
}

function getFileMessagePreview(tags: string[][], content: string) {
  const fileType = tags.find(([tagName]) => tagName === 'file-type')?.[1]?.toLowerCase()

  if (fileType?.startsWith('image/')) {
    return 'Photo'
  }
  if (fileType?.startsWith('video/')) {
    return 'Video'
  }
  if (fileType?.startsWith('audio/')) {
    return 'Audio'
  }

  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(content)) {
    return 'Photo'
  }
  if (/\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(content)) {
    return 'Video'
  }
  if (/\.(mp3|wav|flac|aac|m4a|opus|wma)(\?.*)?$/i.test(content)) {
    return 'Audio'
  }

  return 'Attachment'
}

function getConversationMessagePreview(message: TDirectMessage) {
  if (message.kind === 15) {
    return getFileMessagePreview(message.tags, message.content)
  }

  const hasImetaTag = message.tags.some(([tagName]) => tagName === 'imeta')
  const contentWithoutUrls = message.content.replace(/https?:\/\/\S+/g, '').trim()

  if (hasImetaTag && !contentWithoutUrls) {
    return 'Media attachment'
  }

  return getMessagePreview(message.content)
}

function isEventWithId(value: unknown): value is Event {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<Event>
  return (
    typeof event.id === 'string' &&
    typeof event.pubkey === 'string' &&
    typeof event.created_at === 'number' &&
    typeof event.kind === 'number' &&
    typeof event.content === 'string' &&
    Array.isArray(event.tags)
  )
}

function hasEventSignature(value: unknown): value is Event {
  return !!value && typeof value === 'object' && typeof (value as Partial<Event>).sig === 'string'
}

function hasNoEventSignature(value: unknown) {
  return !value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'sig')
}

function isVerifiedSealEvent(value: unknown): value is Event {
  if (!isEventWithId(value) || !hasEventSignature(value) || !validateEvent(value)) {
    return false
  }

  return verifyEvent(value)
}

function isUnsignedRumorEvent(value: unknown): value is Event {
  if (!isEventWithId(value) || !hasNoEventSignature(value) || !validateEvent(value)) {
    return false
  }

  return value.id === getEventHash(value)
}

async function preferAuthProtectedRelayUrls(relayUrls: string[]) {
  const uniqueRelayUrls = Array.from(new Set(relayUrls))

  if (uniqueRelayUrls.length <= 1) {
    return uniqueRelayUrls
  }

  try {
    const relayInfos = await Promise.race([
      relayInfoService.getRelayInfos(uniqueRelayUrls),
      new Promise<(ReturnType<typeof relayInfoService.getRelayInfos> extends Promise<infer T> ? T : never)>(
        (resolve) => {
          window.setTimeout(() => resolve([]), RELAY_INFO_LOOKUP_TIMEOUT_MS)
        }
      )
    ])

    const authProtectedRelayUrls = uniqueRelayUrls.filter((url, index) =>
      checkAuthProtectedRelay(relayInfos[index])
    )

    return authProtectedRelayUrls.length > 0 ? authProtectedRelayUrls : uniqueRelayUrls
  } catch {
    return uniqueRelayUrls
  }
}

function mergeMessages(current: TDirectMessage[], incoming: TDirectMessage[]) {
  const messageMap = new Map<string, TDirectMessage>()

  current.forEach((message) => {
    messageMap.set(message.id, message)
  })

  incoming.forEach((message) => {
    messageMap.set(message.id, message)
  })

  return Array.from(messageMap.values()).sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt
    }
    return b.wrapId.localeCompare(a.wrapId)
  })
}

function mergeReactions(current: TDirectMessageReaction[], incoming: TDirectMessageReaction[]) {
  const reactionMap = new Map<string, TDirectMessageReaction>()

  current.forEach((reaction) => {
    reactionMap.set(reaction.id, reaction)
  })

  incoming.forEach((reaction) => {
    reactionMap.set(reaction.id, reaction)
  })

  return Array.from(reactionMap.values()).sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt
    }
    return b.wrapId.localeCompare(a.wrapId)
  })
}

function isDirectMessageEvent(event: TConversationEvent): event is TDirectMessage {
  return !('targetMessageId' in event)
}

function isDirectMessageReactionEvent(
  event: TConversationEvent
): event is TDirectMessageReaction {
  return 'targetMessageId' in event
}

function randomWrappedTimestamp() {
  return Math.round(Date.now() / 1000 - Math.random() * TWO_DAYS_IN_SECONDS)
}

export const useMessages = () => {
  const context = useContext(MessagesContext)
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider')
  }
  return context
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { pubkey, account, inboxRelayUrls, nip44Supported, nip44Decrypt, nip44Encrypt, signEvent } =
    useNostr()
  const { followings } = useFollowList()
  const [messages, setMessages] = useState<TDirectMessage[]>([])
  const [reactions, setReactions] = useState<TDirectMessageReaction[]>([])
  const [messagesReadAt, setMessagesReadAt] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationReadAtMap, setConversationReadAtMap] = useState<Record<string, number>>({})
  const [dismissedConversationMap, setDismissedConversationMap] = useState<Record<string, number>>({})
  const decryptRef = useRef(nip44Decrypt)
  const decryptedMessageCacheRef = useRef(new Map<string, TConversationEvent | null>())

  useEffect(() => {
    decryptRef.current = nip44Decrypt
  }, [nip44Decrypt])

  useEffect(() => {
    decryptedMessageCacheRef.current.clear()
  }, [pubkey])

  const relayUrls = useMemo(() => {
    return Array.from(new Set(inboxRelayUrls))
  }, [inboxRelayUrls])

  const isSupported = !!pubkey && account?.signerType !== 'npub' && nip44Supported

  const unwrapDirectMessage = useCallback(
    async (wrap: Event, accountPubkey: string): Promise<TConversationEvent | null> => {
      const cached = decryptedMessageCacheRef.current.get(wrap.id)
      if (cached !== undefined) {
        return cached
      }

      try {
        const sealContent = await decryptRef.current(wrap.pubkey, wrap.content)
        const parsedSeal = JSON.parse(sealContent)
        if (
          !isVerifiedSealEvent(parsedSeal) ||
          parsedSeal.kind !== kinds.Seal ||
          parsedSeal.tags.length !== 0
        ) {
          decryptedMessageCacheRef.current.set(wrap.id, null)
          return null
        }

        const rumorContent = await decryptRef.current(parsedSeal.pubkey, parsedSeal.content)
        const parsedRumor = JSON.parse(rumorContent)
        if (!isUnsignedRumorEvent(parsedRumor)) {
          decryptedMessageCacheRef.current.set(wrap.id, null)
          return null
        }
        if (parsedSeal.pubkey !== parsedRumor.pubkey) {
          decryptedMessageCacheRef.current.set(wrap.id, null)
          return null
        }

        const recipientPubkeys = Array.from(
          new Set(
            parsedRumor.tags
              .filter(([tagName, tagValue]) => tagName === 'p' && !!tagValue)
              .map(([, tagValue]) => tagValue)
          )
        )
        const isOutgoing = parsedRumor.pubkey === accountPubkey
        if (!isOutgoing && !recipientPubkeys.includes(accountPubkey)) {
          decryptedMessageCacheRef.current.set(wrap.id, null)
          return null
        }
        const participantPubkeys = Array.from(
          new Set(
            (
              isOutgoing
                ? recipientPubkeys
                : [parsedRumor.pubkey].concat(recipientPubkeys)
            ).filter((participantPubkey) => participantPubkey !== accountPubkey)
          )
        ).sort()

        if (participantPubkeys.length === 0) {
          decryptedMessageCacheRef.current.set(wrap.id, null)
          return null
        }

        const baseEvent: TConversationEventBase = {
          id: parsedRumor.id,
          wrapId: wrap.id,
          createdAt: parsedRumor.created_at,
          senderPubkey: parsedRumor.pubkey,
          recipientPubkeys,
          participantPubkeys,
          conversationId: toConversationId(participantPubkeys),
          isOutgoing
        }

        if (parsedRumor.kind === kinds.PrivateDirectMessage || parsedRumor.kind === 15) {
          const message: TDirectMessage = {
            ...baseEvent,
            kind: parsedRumor.kind,
            tags: parsedRumor.tags,
            content: parsedRumor.content,
            subject: parsedRumor.tags.find(([tagName]) => tagName === 'subject')?.[1],
            replyToId:
              parsedRumor.tags.find(
                ([tagName, , , marker]) => tagName === 'e' && marker === 'reply'
              )?.[1] ?? parsedRumor.tags.find(([tagName]) => tagName === 'e')?.[1]
          }

          decryptedMessageCacheRef.current.set(wrap.id, message)
          return message
        }

        if (parsedRumor.kind === kinds.Reaction) {
          const targetMessageId = parsedRumor.tags.find(([tagName]) => tagName === 'e')?.[1]

          if (!targetMessageId) {
            decryptedMessageCacheRef.current.set(wrap.id, null)
            return null
          }

          const reaction: TDirectMessageReaction = {
            ...baseEvent,
            targetMessageId,
            emoji: parsedRumor.content || '+'
          }

          decryptedMessageCacheRef.current.set(wrap.id, reaction)
          return reaction
        }

        decryptedMessageCacheRef.current.set(wrap.id, null)
        return null
      } catch {
        decryptedMessageCacheRef.current.set(wrap.id, null)
        return null
      }
    },
    []
  )

  useEffect(() => {
    if (!pubkey) {
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

    if (account?.signerType === 'npub') {
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages require a signer that can decrypt NIP-17 messages.')
      return
    }
    if (!nip44Supported) {
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages require a signer that supports NIP-44.')
      return
    }
    if (relayUrls.length === 0) {
      setIsLoading(false)
      setHasLoadedMessages(true)
      setError('Direct messages need inbox relays (kind 10050) to receive messages.')
      return
    }

    let isMounted = true
    let reconnectTimer: number | undefined
    let subscription: { close: () => void } | null = null

    const applyWrappedEvents = async (wrappedEvents: Event[]) => {
      const unwrappedEvents = (
        await Promise.all(
          wrappedEvents.map((wrappedEvent) => unwrapDirectMessage(wrappedEvent, pubkey))
        )
      ).filter((event): event is TConversationEvent => !!event)

      const unwrappedMessages = unwrappedEvents.filter(isDirectMessageEvent)
      const unwrappedReactions = unwrappedEvents.filter(isDirectMessageReactionEvent)

      if (unwrappedEvents.length > 0) {
        const participantPubkeys = Array.from(
          new Set(
            unwrappedEvents.flatMap((event) => [
              event.senderPubkey,
              ...event.participantPubkeys
            ])
          )
        )

        void client.prefetchProfiles(participantPubkeys)
      }

      if (!isMounted || unwrappedEvents.length === 0) {
        return unwrappedEvents.length
      }

      if (unwrappedMessages.length > 0) {
        setMessages((currentMessages) => mergeMessages(currentMessages, unwrappedMessages))
      }

      if (unwrappedReactions.length > 0) {
        setReactions((currentReactions) => mergeReactions(currentReactions, unwrappedReactions))
      }

      return unwrappedEvents.length
    }

    const startSubscription = () => {
      subscription?.close()
      subscription = client.subscribe(
        relayUrls,
        {
          kinds: [kinds.GiftWrap],
          '#p': [pubkey],
          limit: MESSAGE_FETCH_LIMIT
        },
        {
          onevent: (wrappedEvent) => {
            void applyWrappedEvents([wrappedEvent])
          },
          onAllClose: (reasons) => {
            if (!isMounted || reasons.every((reason) => reason === 'closed by caller')) {
              return
            }

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
        const streamedWrapIds = new Set<string>()
        const streamedApplyPromises: Promise<number>[] = []

        const wrappedEvents = await client.fetchEvents(
          relayUrls,
          {
            kinds: [kinds.GiftWrap],
            '#p': [pubkey],
            limit: MESSAGE_FETCH_LIMIT
          },
          {
            onevent: (wrappedEvent) => {
              if (streamedWrapIds.has(wrappedEvent.id)) {
                return
              }

              streamedWrapIds.add(wrappedEvent.id)
              streamedApplyPromises.push(applyWrappedEvents([wrappedEvent]))
            }
          }
        )
        if (!isMounted) return

        const streamedUnwrappedCounts = await Promise.all(streamedApplyPromises)
        const remainingWrappedEvents = wrappedEvents.filter(
          (wrappedEvent) => !streamedWrapIds.has(wrappedEvent.id)
        )
        const remainingUnwrappedCount =
          remainingWrappedEvents.length > 0 ? await applyWrappedEvents(remainingWrappedEvents) : 0
        const unwrappedCount =
          streamedUnwrappedCounts.reduce((total, count) => total + count, 0) +
          remainingUnwrappedCount

        if (wrappedEvents.length > 0 && unwrappedCount === 0) {
          setError('Wrapped messages were found, but they could not be decrypted with this signer.')
        } else {
          setError(null)
        }
      } catch (loadError) {
        if (isMounted) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load direct messages.'
          setError(message)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setHasLoadedMessages(true)
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
  }, [account?.signerType, nip44Supported, pubkey, relayUrls, unwrapDirectMessage])

  const conversations = useMemo(() => {
    const followingSet = new Set(followings)
    const conversationMap = new Map<string, TMessageConversation>()

    const sortedMessages = messages
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))

    sortedMessages.forEach((message) => {
      const existingConversation = conversationMap.get(message.conversationId)

      if (!existingConversation) {
        conversationMap.set(message.conversationId, {
          id: message.conversationId,
          participantPubkeys: message.participantPubkeys,
          primaryPubkey: message.participantPubkeys[0],
          isGroup: message.participantPubkeys.length > 1,
          isRequest: false,
          unreadCount: 0,
          lastMessageAt: message.createdAt,
          lastMessagePreview: getConversationMessagePreview(message),
          subject: message.subject,
          messages: [message],
          reactionsByMessageId: {},
          hasOutgoingActivity: message.isOutgoing
        })
        return
      }

      existingConversation.messages.push(message)
      existingConversation.lastMessageAt = message.createdAt
      existingConversation.lastMessagePreview = getConversationMessagePreview(message)
      existingConversation.subject = message.subject ?? existingConversation.subject
      existingConversation.hasOutgoingActivity =
        existingConversation.hasOutgoingActivity || message.isOutgoing
    })

    const messageIdsByConversation = new Map<string, Set<string>>(
      Array.from(conversationMap.entries()).map(([conversationId, conversation]) => [
        conversationId,
        new Set(conversation.messages.map((message) => message.id))
      ])
    )

    reactions
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))
      .forEach((reaction) => {
        const conversation = conversationMap.get(reaction.conversationId)
        const messageIds = messageIdsByConversation.get(reaction.conversationId)

        if (!conversation || !messageIds?.has(reaction.targetMessageId)) {
          return
        }

        const existingReactions = conversation.reactionsByMessageId[reaction.targetMessageId] ?? []
        conversation.reactionsByMessageId[reaction.targetMessageId] = [
          ...existingReactions,
          reaction
        ]
        conversation.hasOutgoingActivity =
          conversation.hasOutgoingActivity || reaction.isOutgoing
      })

    return Array.from(conversationMap.values())
      .map((conversation) => {
        const conversationReadAt = Math.max(
          messagesReadAt,
          conversationReadAtMap[conversation.id] ?? 0
        )
        const unreadCount = conversation.messages.filter(
          (message) => !message.isOutgoing && message.createdAt > conversationReadAt
        ).length
        const isSingleParticipantConversation = conversation.participantPubkeys.length === 1
        const isGroupConversation = conversation.participantPubkeys.length > 1
        const primaryParticipantPubkey = conversation.primaryPubkey

        return {
          ...conversation,
          unreadCount,
          isRequest:
            isGroupConversation
              ? !conversation.hasOutgoingActivity
              : isSingleParticipantConversation &&
                !!primaryParticipantPubkey &&
                !followingSet.has(primaryParticipantPubkey) &&
                !conversation.hasOutgoingActivity
        }
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
  }, [conversationReadAtMap, followings, messages, messagesReadAt, reactions])

  const visibleConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) => (dismissedConversationMap[conversation.id] ?? 0) < conversation.lastMessageAt
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

      const wrapRecipients = Array.from(new Set([pubkey, ...rumorRecipients]))
      const recipientRelayEntries = await Promise.all(
        wrapRecipients.map(async (recipientPubkey) => {
          const recipientRelayUrls =
            recipientPubkey === pubkey ? relayUrls : await client.fetchInboxRelayList(recipientPubkey)

          return [recipientPubkey, Array.from(new Set(recipientRelayUrls))] as const
        })
      )
      const recipientRelayMap = new Map(recipientRelayEntries)

      if (recipientRelayEntries.some(([, recipientRelayUrls]) => recipientRelayUrls.length === 0)) {
        throw new Error('One or more recipients have not published NIP-17 inbox relays yet.')
      }

      return Promise.all(
        wrapRecipients.map(async (recipientPubkey) => {
          const recipientRelayUrls = recipientRelayMap.get(recipientPubkey) ?? []
          const sealEvent = await signEvent({
            kind: kinds.Seal,
            content: await nip44Encrypt(recipientPubkey, JSON.stringify(rumorEvent)),
            created_at: randomWrappedTimestamp(),
            tags: []
          })

          const randomKey = generateSecretKey()
          const wrapEvent = finalizeEvent(
            {
              kind: kinds.GiftWrap,
              content: encryptNip44(randomKey, recipientPubkey, JSON.stringify(sealEvent)),
              created_at: randomWrappedTimestamp(),
              tags: [
                recipientRelayUrls[0]
                  ? ['p', recipientPubkey, recipientRelayUrls[0]]
                  : ['p', recipientPubkey]
              ]
            },
            randomKey
          )

          return { recipientPubkey, wrapEvent, relayUrls: recipientRelayUrls }
        })
      )
    },
    [nip44Encrypt, pubkey, relayUrls, signEvent]
  )

  const publishWrappedRumorEvents = useCallback(
    async (wrappedEvents: { recipientPubkey: string; wrapEvent: Event; relayUrls: string[] }[]) => {
      return Promise.allSettled(
        wrappedEvents.map(async ({ relayUrls, wrapEvent }) => {
          await client.publishEvent(await preferAuthProtectedRelayUrls(relayUrls), wrapEvent)
        })
      )
    },
    []
  )

  const sendMessage = useCallback(
    async (
      recipientPubkeys: string[],
      content: string,
      options: { replyToId?: string; subject?: string; additionalTags?: string[][] } = {}
    ) => {
      if (!pubkey || account?.signerType === 'npub' || !nip44Supported) {
        throw new Error('Direct messages require a signer that can encrypt NIP-17 messages.')
      }
      if (relayUrls.length === 0) {
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
        kind: kinds.PrivateDirectMessage,
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

          const selfWrapEvent = wrappedEvents.find(({ recipientPubkey }) => recipientPubkey === pubkey)?.wrapEvent
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
          setMessages((currentMessages) => currentMessages.filter((message) => message.id !== rumorEvent.id))
          toast.error(error instanceof Error ? error.message : t('Failed to send message'))
        }
      })()
    },
    [
      account?.signerType,
      buildWrappedRumorEvents,
      nip44Supported,
      pubkey,
      publishWrappedRumorEvents,
      relayUrls,
      t
    ]
  )

  const sendReaction = useCallback(
    async (recipientPubkeys: string[], targetMessage: TDirectMessage, emoji: string) => {
      if (!pubkey || account?.signerType === 'npub' || !nip44Supported) {
        throw new Error('Direct messages require a signer that can encrypt NIP-17 messages.')
      }
      if (relayUrls.length === 0) {
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
      rumorTags.push(['k', String(kinds.PrivateDirectMessage)])

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

          const selfWrapEvent = wrappedEvents.find(({ recipientPubkey }) => recipientPubkey === pubkey)?.wrapEvent
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
    [
      account?.signerType,
      buildWrappedRumorEvents,
      nip44Supported,
      pubkey,
      publishWrappedRumorEvents,
      relayUrls,
      t
    ]
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

      storage.setDismissedMessageConversationTime(pubkey, conversationId, conversation.lastMessageAt)
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
