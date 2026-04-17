import { TEmoji, TNoteReaction } from '@/types'
import { tagNameEquals } from './tag'

export const REACTION_BONUS_TAG = 'reaction_bonus'
export const MAX_REACTION_BOOST_VISUAL_BONUS_COUNT = 32

type TReactionSummary = {
  key: string
  emoji: TEmoji | string
  pubkeys: Set<string>
  weight: number
}

export function clampReactionBonusCount(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : 0

  if (!Number.isFinite(numericValue)) return 0

  return Math.max(0, Math.trunc(numericValue))
}

export function getReactionBonusCountFromTags(tags: string[][] = []) {
  const bonusTag = tags.findLast(tagNameEquals(REACTION_BONUS_TAG))
  return clampReactionBonusCount(bonusTag?.[1])
}

export function getReactionWeight(bonusCount?: number) {
  return 1 + clampReactionBonusCount(bonusCount)
}

export function getReactionBoostVisualProgress(bonusCount?: number) {
  const clampedBonusCount = Math.min(
    clampReactionBonusCount(bonusCount),
    MAX_REACTION_BOOST_VISUAL_BONUS_COUNT
  )

  if (clampedBonusCount <= 0) return 0

  return (
    Math.log2(clampedBonusCount + 1) /
    Math.log2(MAX_REACTION_BOOST_VISUAL_BONUS_COUNT + 1)
  )
}

export function getWeightedReactionCount(reactions: TNoteReaction[] = []) {
  return reactions.reduce((total, reaction) => total + getReactionWeight(reaction.bonusCount), 0)
}

export function isStandardLikeEmoji(emoji?: string | TEmoji): boolean {
  return typeof emoji === 'string' && (emoji === '+' || emoji === '❤️')
}

export function getReactionDisplayEmoji(emoji: string | TEmoji): string | TEmoji {
  if (typeof emoji === 'string' && emoji === '+') {
    return '❤️'
  }

  return emoji
}

export function getReactionGroupKey(emoji: string | TEmoji) {
  if (typeof emoji === 'string') {
    return emoji === '+' ? '❤️' : emoji
  }

  return emoji.url
}

export function summarizeReactions(reactions: TNoteReaction[] = []): TReactionSummary[] {
  const stats = new Map<string, TReactionSummary>()

  reactions.forEach((reaction) => {
    const key = getReactionGroupKey(reaction.emoji)
    const existing = stats.get(key)

    if (existing) {
      existing.weight += getReactionWeight(reaction.bonusCount)
      existing.pubkeys.add(reaction.pubkey)
      return
    }

    stats.set(key, {
      key,
      emoji: getReactionDisplayEmoji(reaction.emoji),
      pubkeys: new Set([reaction.pubkey]),
      weight: getReactionWeight(reaction.bonusCount)
    })
  })

  return Array.from(stats.values()).sort((a, b) => b.weight - a.weight)
}
