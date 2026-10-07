import { ExtendedKind } from '@/constants'
import { kinds, type Filter } from 'nostr-tools'

type ReplyRootScope = { type: 'E' | 'A' | 'I'; id: string }

// A kind 1 note can receive both legacy replies and NIP-22 comments.
// Uppercase tags fetch the complete comment thread, including nested replies.
export function buildReplyFilters(
  root: ReplyRootScope,
  limit: number
): (Omit<Filter, 'since' | 'until'> & { limit: number })[] {
  const commentKinds = [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT]
  if (root.type === 'E') {
    return [
      { '#e': [root.id], kinds: [kinds.ShortTextNote], limit },
      { '#E': [root.id], kinds: commentKinds, limit }
    ]
  }
  if (root.type === 'A') {
    return [
      { '#a': [root.id], kinds: [kinds.ShortTextNote], limit },
      { '#A': [root.id], kinds: commentKinds, limit }
    ]
  }
  return [{ '#I': [root.id], kinds: commentKinds, limit }]
}
