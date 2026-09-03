import { Event } from 'nostr-tools'

export const REPLY_SPAM_SCORE_THRESHOLD = 0.85

export type TReplySpamOptions = {
  currentPubkey?: string | null
  markedPubkeys?: ReadonlySet<string>
  safelistedPubkeys?: ReadonlySet<string>
  followedPubkeys?: ReadonlySet<string>
  isFollowed?: (pubkey: string) => boolean
  enabled: boolean
  signature: string
  cachedScore: (pubkey: string, signature: string) => number | undefined
}

export type TReplySpamPartition = {
  visible: Event[]
  hidden: Event[]
  pending: Event[]
  pendingPubkeys: string[]
}

export type TAuthorSpamOptions = TReplySpamOptions
export type TAuthorSpamPartition = TReplySpamPartition

export function reconcileSpamRepliesExpanded(isExpanded: boolean, hiddenReplyCount: number) {
  return hiddenReplyCount > 0 && isExpanded
}

export function reconcileSpamRepliesExpansionScope(
  expandedScope: string | undefined,
  currentScope: string,
  hiddenReplyCount: number
) {
  return reconcileSpamRepliesExpanded(expandedScope === currentScope, hiddenReplyCount)
    ? currentScope
    : undefined
}

function normalizePubkey(pubkey: string) {
  return pubkey.trim().toLowerCase()
}

function setHasPubkey(pubkeys: ReadonlySet<string> | undefined, pubkey: string) {
  if (!pubkeys) return false
  return pubkeys.has(pubkey) || pubkeys.has(pubkey.toUpperCase())
}

/**
 * Splits replies without triggering asynchronous scoring. Cache misses stay
 * hidden until their author has a score, which prevents reply-list flicker.
 */
export function partitionReplySpam(
  events: readonly Event[],
  {
    currentPubkey,
    markedPubkeys,
    safelistedPubkeys,
    followedPubkeys,
    isFollowed,
    enabled,
    signature,
    cachedScore
  }: TReplySpamOptions
): TReplySpamPartition {
  const visible: Event[] = []
  const hidden: Event[] = []
  const pending: Event[] = []
  const pendingPubkeys: string[] = []
  const pendingPubkeySet = new Set<string>()
  const normalizedCurrentPubkey = currentPubkey ? normalizePubkey(currentPubkey) : undefined

  events.forEach((event) => {
    const pubkey = normalizePubkey(event.pubkey)

    if (pubkey === normalizedCurrentPubkey || setHasPubkey(safelistedPubkeys, pubkey)) {
      visible.push(event)
      return
    }

    // A manual mark always wins, including over trusted-child promotion and a disabled auto filter.
    if (setHasPubkey(markedPubkeys, pubkey)) {
      hidden.push(event)
      return
    }

    if (setHasPubkey(followedPubkeys, pubkey) || isFollowed?.(pubkey)) {
      visible.push(event)
      return
    }

    if (!enabled) {
      visible.push(event)
      return
    }

    const score = cachedScore(pubkey, signature)
    if (score === undefined) {
      pending.push(event)
      if (pubkey && !pendingPubkeySet.has(pubkey)) {
        pendingPubkeySet.add(pubkey)
        pendingPubkeys.push(pubkey)
      }
      return
    }

    if (score >= REPLY_SPAM_SCORE_THRESHOLD) {
      hidden.push(event)
      return
    }

    visible.push(event)
  })

  return { visible, hidden, pending, pendingPubkeys }
}

export const partitionAuthorSpam = partitionReplySpam
export const partitionRepliesBySpam = partitionReplySpam
