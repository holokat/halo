import {
  getReactionBonusCountFromTags,
  getReactionBoostVisualProgress,
  getReactionWeight
} from './reaction'
import { TEmoji } from '@/types'
import { Event as NostrEvent } from 'nostr-tools'
import { getEmojiInfosFromEmojiTags, tagNameEquals } from './tag'

export type TLiveReactionFountainVisual =
  | {
      kind: 'heart'
      emoji: '+'
    }
  | {
      kind: 'emoji'
      emoji: string
    }
  | {
      kind: 'customEmoji'
      emoji: TEmoji
    }

export type TLiveReactionFountainPayload = {
  id: string
  authorPubkey: string
  createdAt: number
  relayUrl: string
  bonusCount: number
  targetEventId?: string
  targetCoordinate?: string
  visual: TLiveReactionFountainVisual
}

const CUSTOM_EMOJI_CONTENT_REGEX = /^:([^:\s]+):$/
export const MAX_LIVE_REACTION_FOUNTAIN_EVENT_PARTICLES = 16

export function getLiveReactionFountainVisual(
  event: Pick<NostrEvent, 'content' | 'tags'>
): TLiveReactionFountainVisual {
  const trimmedContent = event.content.trim()
  if (!trimmedContent || trimmedContent === '+') {
    return {
      kind: 'heart',
      emoji: '+'
    }
  }

  const shortcodeMatch = CUSTOM_EMOJI_CONTENT_REGEX.exec(trimmedContent)
  if (shortcodeMatch) {
    const shortcode = shortcodeMatch[1]
    const emoji = getEmojiInfosFromEmojiTags(event.tags).find(
      (item) => item.shortcode === shortcode
    )

    if (emoji) {
      return {
        kind: 'customEmoji',
        emoji
      }
    }
  }

  return {
    kind: 'emoji',
    emoji: trimmedContent
  }
}

export function isReactionTargetingPubkey(
  event: Pick<NostrEvent, 'tags'>,
  pubkey: string | null | undefined
) {
  if (!pubkey) return false
  return event.tags.findLast(tagNameEquals('p'))?.[1] === pubkey
}

export function getReactionTargetEventId(event: Pick<NostrEvent, 'tags'>) {
  return event.tags.findLast(tagNameEquals('e'))?.[1]
}

export function getReactionTargetCoordinate(event: Pick<NostrEvent, 'tags'>) {
  return event.tags.findLast(tagNameEquals('a'))?.[1]
}

export function getLiveReactionFountainBonusCount(event: Pick<NostrEvent, 'tags'>) {
  return getReactionBonusCountFromTags(event.tags)
}

export function getLiveReactionFountainParticleCount(bonusCount?: number) {
  return Math.min(
    MAX_LIVE_REACTION_FOUNTAIN_EVENT_PARTICLES,
    Math.max(1, getReactionWeight(bonusCount))
  )
}

export function getLiveReactionFountainBurstProgress(bonusCount?: number) {
  return getReactionBoostVisualProgress(bonusCount)
}

export function getLiveReactionFountainPayloadFromEvent(
  event: Pick<NostrEvent, 'id' | 'pubkey' | 'created_at' | 'content' | 'tags'>,
  {
    activePubkey,
    relayUrl
  }: {
    activePubkey: string | null | undefined
    relayUrl: string
  }
): TLiveReactionFountainPayload | null {
  if (!isReactionTargetingPubkey(event, activePubkey) || !activePubkey) {
    return null
  }

  if (event.pubkey === activePubkey) {
    return null
  }

  return {
    id: event.id,
    authorPubkey: event.pubkey,
    createdAt: event.created_at,
    relayUrl,
    bonusCount: getLiveReactionFountainBonusCount(event),
    targetEventId: getReactionTargetEventId(event),
    targetCoordinate: getReactionTargetCoordinate(event),
    visual: getLiveReactionFountainVisual(event)
  }
}
