import { Event } from 'nostr-tools'
import { decode } from 'nostr-tools/nip19'
import {
  getReplaceableCoordinateFromEvent,
  hasExcessiveHashtags,
  hasExcessiveMentions,
  hasMutedHashtag,
  hasMedia,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent
} from '@/lib/event'
import { isEventExpired } from '@/lib/event-expiration'

export type TNoteListVisibilityOptions = {
  additionalFilter?: (event: Event) => boolean
  filterMutedNotes: boolean
  hideContentMentioningMutedUsers: boolean
  hideReplies: boolean
  hideUntrustedNotes: boolean
  isEventDeleted: (event: Event) => boolean
  isUserTrusted: (pubkey: string) => boolean
  mediaOnly: boolean
  maxHashtags: number
  maxMentions: number
  mutePubkeySet: Set<string>
  mutedTags: string[]
  mutedWordsLower: string[]
  pinnedEventHexIdSet: Set<string>
  spamMarkedPubkeySet: ReadonlySet<string>
}

type TVisibilityFilterOptions = {
  ignoreHashtagLimit?: boolean
  ignoreMediaOnly?: boolean
}

export function buildPinnedEventHexIdSet(pinnedEventIds: string[]) {
  const set = new Set<string>()

  pinnedEventIds.forEach((id) => {
    try {
      const { type, data } = decode(id)
      if (type === 'nevent') {
        set.add(data.id)
      }
    } catch {
      // Ignore invalid ids.
    }
  })

  return set
}

function shouldHideEvent(
  evt: Event,
  options: TNoteListVisibilityOptions,
  visibilityOptions: TVisibilityFilterOptions = {}
) {
  const {
    additionalFilter,
    filterMutedNotes,
    hideContentMentioningMutedUsers,
    hideReplies,
    hideUntrustedNotes,
    isEventDeleted,
    isUserTrusted,
    mediaOnly,
    maxHashtags,
    maxMentions,
    mutePubkeySet,
    mutedTags,
    mutedWordsLower,
    pinnedEventHexIdSet,
    spamMarkedPubkeySet
  } = options
  const { ignoreHashtagLimit = false, ignoreMediaOnly = false } = visibilityOptions

  if (isEventExpired(evt)) return true
  if (spamMarkedPubkeySet.has(evt.pubkey.trim().toLowerCase())) return true
  if (pinnedEventHexIdSet.has(evt.id)) return true
  if (isEventDeleted(evt)) return true
  if (hideReplies && isReplyNoteEvent(evt)) return true
  if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return true
  if (filterMutedNotes && mutePubkeySet.has(evt.pubkey)) return true
  if (
    filterMutedNotes &&
    hideContentMentioningMutedUsers &&
    isMentioningMutedUsers(evt, mutePubkeySet)
  ) {
    return true
  }

  if (filterMutedNotes && mutedTags.length > 0 && hasMutedHashtag(evt, mutedTags)) return true

  if (filterMutedNotes && mutedWordsLower.length > 0) {
    const content = evt.content.toLowerCase()
    if (mutedWordsLower.some((word) => content.includes(word))) {
      return true
    }
  }

  if (!ignoreMediaOnly && mediaOnly && !hasMedia(evt)) {
    return true
  }

  if (!ignoreHashtagLimit && hasExcessiveHashtags(evt, maxHashtags)) {
    return true
  }

  if (hasExcessiveMentions(evt, maxMentions)) {
    return true
  }

  if (additionalFilter && !additionalFilter(evt)) {
    return true
  }

  return false
}

export function filterVisibleNoteEvents(
  sourceEvents: Event[],
  options: TNoteListVisibilityOptions,
  visibilityOptions: TVisibilityFilterOptions = {}
) {
  const idSet = new Set<string>()

  return sourceEvents.filter((evt) => {
    if (shouldHideEvent(evt, options, visibilityOptions)) return false

    const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
    if (idSet.has(id)) {
      return false
    }
    idSet.add(id)
    return true
  })
}
