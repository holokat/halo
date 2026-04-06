import { Event, getEventHash, kinds, validateEvent, verifyEvent } from 'nostr-tools'
import {
  TConversationEvent,
  TConversationEventBase,
  TDirectMessage,
  TDirectMessageReaction
} from './types'
import { toConversationId } from './shared'

export type { TConversationEvent } from './types'

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

export function getConversationMessagePreview(message: TDirectMessage) {
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

export function isDirectMessageEvent(event: TConversationEvent): event is TDirectMessage {
  const maybeMessage = event as TDirectMessage
  return (
    'kind' in event &&
    (maybeMessage.kind === kinds.PrivateDirectMessage || maybeMessage.kind === 15)
  )
}

export function isDirectMessageReactionEvent(
  event: TConversationEvent
): event is TDirectMessageReaction {
  return 'targetMessageId' in event
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

export async function unwrapDirectMessage(
  wrap: Event,
  accountPubkey: string,
  decrypt: (pubkey: string, cipherText: string) => Promise<string>,
  cache: Map<string, TConversationEvent | null>
): Promise<TConversationEvent | null> {
  const cached = cache.get(wrap.id)
  if (cached !== undefined) {
    return cached
  }

  try {
    const sealContent = await decrypt(wrap.pubkey, wrap.content)
    const parsedSeal = JSON.parse(sealContent)
    if (
      !isVerifiedSealEvent(parsedSeal) ||
      parsedSeal.kind !== kinds.Seal ||
      parsedSeal.tags.length !== 0
    ) {
      cache.set(wrap.id, null)
      return null
    }

    const rumorContent = await decrypt(parsedSeal.pubkey, parsedSeal.content)
    const parsedRumor = JSON.parse(rumorContent)
    if (!isUnsignedRumorEvent(parsedRumor)) {
      cache.set(wrap.id, null)
      return null
    }
    if (parsedSeal.pubkey !== parsedRumor.pubkey) {
      cache.set(wrap.id, null)
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
      cache.set(wrap.id, null)
      return null
    }
    const participantPubkeys = Array.from(
      new Set(
        (isOutgoing ? recipientPubkeys : [parsedRumor.pubkey].concat(recipientPubkeys)).filter(
          (participantPubkey) => participantPubkey !== accountPubkey
        )
      )
    ).sort()

    if (participantPubkeys.length === 0) {
      cache.set(wrap.id, null)
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
          parsedRumor.tags.find(([tagName, , , marker]) => tagName === 'e' && marker === 'reply')?.[1] ??
          parsedRumor.tags.find(([tagName]) => tagName === 'e')?.[1]
      }

      cache.set(wrap.id, message)
      return message
    }

    if (parsedRumor.kind === kinds.Reaction) {
      const targetMessageId = parsedRumor.tags.find(([tagName]) => tagName === 'e')?.[1]

      if (!targetMessageId) {
        cache.set(wrap.id, null)
        return null
      }

      const reaction: TDirectMessageReaction = {
        ...baseEvent,
        targetMessageId,
        emoji: parsedRumor.content || '+'
      }

      cache.set(wrap.id, reaction)
      return reaction
    }

    cache.set(wrap.id, null)
    return null
  } catch {
    return null
  }
}
