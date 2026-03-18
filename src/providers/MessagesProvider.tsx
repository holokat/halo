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

type TDirectMessage = {
  id: string
  wrapId: string
  content: string
  createdAt: number
  senderPubkey: string
  recipientPubkeys: string[]
  participantPubkeys: string[]
  conversationId: string
  subject?: string
  replyToId?: string
  isOutgoing: boolean
}

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
  hasOutgoingMessages: boolean
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
  error: string | null
  isSupported: boolean
  markAllAsRead: () => void
  sendMessage: (
    recipientPubkeys: string[],
    content: string,
    options?: { replyToId?: string; subject?: string }
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
  const [messagesReadAt, setMessagesReadAt] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decryptRef = useRef(nip44Decrypt)
  const decryptedMessageCacheRef = useRef(new Map<string, TDirectMessage | null>())

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
    async (wrap: Event, accountPubkey: string): Promise<TDirectMessage | null> => {
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
        if (!isUnsignedRumorEvent(parsedRumor) || parsedRumor.kind !== kinds.PrivateDirectMessage) {
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

        const message: TDirectMessage = {
          id: parsedRumor.id,
          wrapId: wrap.id,
          content: parsedRumor.content,
          createdAt: parsedRumor.created_at,
          senderPubkey: parsedRumor.pubkey,
          recipientPubkeys,
          participantPubkeys,
          conversationId: toConversationId(participantPubkeys),
          subject: parsedRumor.tags.find(([tagName]) => tagName === 'subject')?.[1],
          replyToId:
            parsedRumor.tags.find(
              ([tagName, , , marker]) => tagName === 'e' && marker === 'reply'
            )?.[1] ?? parsedRumor.tags.find(([tagName]) => tagName === 'e')?.[1],
          isOutgoing
        }

        decryptedMessageCacheRef.current.set(wrap.id, message)
        return message
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
      setMessagesReadAt(0)
      setIsLoading(false)
      setError(null)
      return
    }

    setMessagesReadAt(storage.getLastReadMessageTime(pubkey))
    setMessages([])
    setError(null)

    if (account?.signerType === 'npub') {
      setIsLoading(false)
      setError('Direct messages require a signer that can decrypt NIP-17 messages.')
      return
    }
    if (!nip44Supported) {
      setIsLoading(false)
      setError('Direct messages require a signer that supports NIP-44.')
      return
    }
    if (relayUrls.length === 0) {
      setIsLoading(false)
      setError('Direct messages need inbox relays (kind 10050) to receive messages.')
      return
    }

    let isMounted = true
    let reconnectTimer: number | undefined
    let subscription: { close: () => void } | null = null

    const applyWrappedEvents = async (wrappedEvents: Event[]) => {
      const unwrappedMessages = (
        await Promise.all(
          wrappedEvents.map((wrappedEvent) => unwrapDirectMessage(wrappedEvent, pubkey))
        )
      ).filter((message): message is TDirectMessage => !!message)

      if (!isMounted || unwrappedMessages.length === 0) {
        return unwrappedMessages.length
      }

      setMessages((currentMessages) => mergeMessages(currentMessages, unwrappedMessages))
      return unwrappedMessages.length
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
        const wrappedEvents = await client.fetchEvents(relayUrls, {
          kinds: [kinds.GiftWrap],
          '#p': [pubkey],
          limit: MESSAGE_FETCH_LIMIT
        })
        if (!isMounted) return

        const unwrappedCount = await applyWrappedEvents(wrappedEvents)
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
          lastMessagePreview: getMessagePreview(message.content),
          subject: message.subject,
          messages: [message],
          hasOutgoingMessages: message.isOutgoing
        })
        return
      }

      existingConversation.messages.push(message)
      existingConversation.lastMessageAt = message.createdAt
      existingConversation.lastMessagePreview = getMessagePreview(message.content)
      existingConversation.subject = message.subject ?? existingConversation.subject
      existingConversation.hasOutgoingMessages =
        existingConversation.hasOutgoingMessages || message.isOutgoing
    })

    return Array.from(conversationMap.values())
      .map((conversation) => {
        const unreadCount = conversation.messages.filter(
          (message) => !message.isOutgoing && message.createdAt > messagesReadAt
        ).length
        const isSingleParticipantConversation = conversation.participantPubkeys.length === 1
        const primaryParticipantPubkey = conversation.primaryPubkey

        return {
          ...conversation,
          unreadCount,
          isRequest:
            isSingleParticipantConversation &&
            !!primaryParticipantPubkey &&
            !followingSet.has(primaryParticipantPubkey) &&
            !conversation.hasOutgoingMessages
        }
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
  }, [followings, messages, messagesReadAt])

  const activeConversations = useMemo(
    () => conversations.filter((conversation) => !conversation.isRequest),
    [conversations]
  )

  const requests = useMemo(
    () => conversations.filter((conversation) => conversation.isRequest),
    [conversations]
  )

  const unreadMessageCount = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations]
  )

  const unreadConversationCount = useMemo(
    () => conversations.filter((conversation) => conversation.unreadCount > 0).length,
    [conversations]
  )

  const sendMessage = useCallback(
    async (
      recipientPubkeys: string[],
      content: string,
      options: { replyToId?: string; subject?: string } = {}
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
          const wrapRecipients = Array.from(new Set([pubkey, ...uniqueRecipients]))
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

          const wrappedEvents = await Promise.all(
            wrapRecipients.map(async (recipientPubkey) => {
              const recipientRelayUrls = recipientRelayMap.get(recipientPubkey) ?? []
              const sealEvent = await signEvent({
                kind: 13,
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

          const selfWrapEvent = wrappedEvents.find(({ recipientPubkey }) => recipientPubkey === pubkey)?.wrapEvent
          const confirmedMessage: TDirectMessage = {
            ...optimisticMessage,
            wrapId: selfWrapEvent?.id ?? wrappedEvents[0].wrapEvent.id
          }

          setMessages((currentMessages) => mergeMessages(currentMessages, [confirmedMessage]))

          const results = await Promise.allSettled(
            wrappedEvents.map(async ({ relayUrls, wrapEvent }) => {
              await client.publishEvent(await preferAuthProtectedRelayUrls(relayUrls), wrapEvent)
            })
          )

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
    [account?.signerType, nip44Encrypt, nip44Supported, pubkey, relayUrls, signEvent, t]
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
        error,
        isSupported,
        markAllAsRead,
        sendMessage
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}
