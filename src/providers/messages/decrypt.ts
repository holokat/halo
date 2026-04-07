import { Event, getEventHash, kinds, validateEvent, verifyEvent } from 'nostr-tools'
import {
  TConversationEvent,
  TConversationEventBase,
  TDirectMessage,
  TDirectMessageReaction
} from './types'
import { toConversationId } from './shared'
import { debugDm, warnDm } from './debug'

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
    debugDm('Using cached DM unwrap result', {
      wrapId: wrap.id,
      result: cached ? 'event' : 'null'
    })
    return cached
  }

  let stage = 'decrypt-wrap'

  try {
    debugDm('Attempting to unwrap DM gift wrap', {
      wrapId: wrap.id,
      wrapPubkey: wrap.pubkey,
      wrapCreatedAt: wrap.created_at,
      recipientPubkey: accountPubkey,
      recipientTags: wrap.tags.filter(([tagName]) => tagName === 'p').map(([, value]) => value)
    })

    const sealContent = await decrypt(wrap.pubkey, wrap.content)
    stage = 'parse-seal'
    const parsedSeal = JSON.parse(sealContent)
    if (
      !isVerifiedSealEvent(parsedSeal) ||
      parsedSeal.kind !== kinds.Seal ||
      parsedSeal.tags.length !== 0
    ) {
      warnDm('Rejected DM wrap because decrypted seal was invalid', {
        wrapId: wrap.id,
        stage,
        sealKind: isEventWithId(parsedSeal) ? parsedSeal.kind : undefined,
        hasSealSignature: hasEventSignature(parsedSeal),
        sealTagsLength: Array.isArray(parsedSeal?.tags) ? parsedSeal.tags.length : undefined
      })
      cache.set(wrap.id, null)
      return null
    }

    stage = 'decrypt-rumor'
    const rumorContent = await decrypt(parsedSeal.pubkey, parsedSeal.content)
    stage = 'parse-rumor'
    const parsedRumor = JSON.parse(rumorContent)
    if (!isUnsignedRumorEvent(parsedRumor)) {
      warnDm('Rejected DM wrap because decrypted rumor was invalid', {
        wrapId: wrap.id,
        stage,
        rumorKind: isEventWithId(parsedRumor) ? parsedRumor.kind : undefined,
        rumorPubkey: isEventWithId(parsedRumor) ? parsedRumor.pubkey : undefined
      })
      cache.set(wrap.id, null)
      return null
    }
    if (parsedSeal.pubkey !== parsedRumor.pubkey) {
      warnDm('Rejected DM wrap because seal pubkey did not match rumor pubkey', {
        wrapId: wrap.id,
        sealPubkey: parsedSeal.pubkey,
        rumorPubkey: parsedRumor.pubkey
      })
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
      warnDm('Rejected DM wrap because account pubkey was not part of recipients', {
        wrapId: wrap.id,
        rumorId: parsedRumor.id,
        senderPubkey: parsedRumor.pubkey,
        recipientPubkeys,
        accountPubkey
      })
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
      warnDm('Rejected DM wrap because no participants remained after normalization', {
        wrapId: wrap.id,
        rumorId: parsedRumor.id,
        recipientPubkeys,
        accountPubkey
      })
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

      debugDm('Successfully unwrapped DM message', {
        wrapId: wrap.id,
        rumorId: parsedRumor.id,
        kind: parsedRumor.kind,
        senderPubkey: parsedRumor.pubkey,
        participantPubkeys,
        isOutgoing
      })
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

      debugDm('Successfully unwrapped DM reaction', {
        wrapId: wrap.id,
        rumorId: parsedRumor.id,
        targetMessageId,
        senderPubkey: parsedRumor.pubkey,
        participantPubkeys,
        isOutgoing
      })
      cache.set(wrap.id, reaction)
      return reaction
    }

    warnDm('Rejected DM wrap because rumor kind is unsupported', {
      wrapId: wrap.id,
      rumorId: parsedRumor.id,
      rumorKind: parsedRumor.kind
    })
    cache.set(wrap.id, null)
    return null
  } catch (error) {
    warnDm('Failed to unwrap DM wrap', {
      wrapId: wrap.id,
      stage,
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}
