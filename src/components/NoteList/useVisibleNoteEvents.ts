import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import {
  buildPinnedEventHexIdSet,
  filterVisibleNoteEvents,
  TNoteListVisibilityOptions
} from './visibility'

type TUseVisibleNoteEventsParams = Omit<TNoteListVisibilityOptions, 'pinnedEventHexIdSet'> & {
  events: Event[]
  ignoreHashtagLimit: boolean
  mediaOnly: boolean
  newEvents: Event[]
  pinnedEventIds: string[]
}

export function useVisibleNoteEvents({
  events,
  ignoreHashtagLimit,
  mediaOnly,
  newEvents,
  pinnedEventIds,
  ...visibilityOptions
}: TUseVisibleNoteEventsParams) {
  const pinnedEventHexIdSet = useMemo(
    () => buildPinnedEventHexIdSet(pinnedEventIds),
    [pinnedEventIds.join(',')]
  )

  const baseVisibilityOptions = useMemo(
    () => ({
      ...visibilityOptions,
      mediaOnly,
      pinnedEventHexIdSet
    }),
    [
      mediaOnly,
      pinnedEventHexIdSet,
      visibilityOptions.additionalFilter,
      visibilityOptions.filterMutedNotes,
      visibilityOptions.hideContentMentioningMutedUsers,
      visibilityOptions.hideReplies,
      visibilityOptions.hideUntrustedNotes,
      visibilityOptions.isEventDeleted,
      visibilityOptions.isUserTrusted,
      visibilityOptions.maxHashtags,
      visibilityOptions.maxMentions,
      visibilityOptions.mutePubkeySet,
      visibilityOptions.mutedTags,
      visibilityOptions.mutedWordsLower
    ]
  )

  const visibleEvents = useMemo(
    () => filterVisibleNoteEvents(events, baseVisibilityOptions),
    [baseVisibilityOptions, events]
  )

  const visibleEventsIgnoringMediaOnly = useMemo(
    () => filterVisibleNoteEvents(events, baseVisibilityOptions, { ignoreMediaOnly: true }),
    [baseVisibilityOptions, events]
  )

  const visibleEventsIgnoringHashtagLimit = useMemo(
    () => filterVisibleNoteEvents(events, baseVisibilityOptions, { ignoreHashtagLimit: true }),
    [baseVisibilityOptions, events]
  )

  const filteredNewEvents = useMemo(
    () => filterVisibleNoteEvents(newEvents, baseVisibilityOptions),
    [baseVisibilityOptions, newEvents]
  )

  return {
    filteredNewEvents,
    hashtagLimitFilteredOutAll:
      !ignoreHashtagLimit &&
      visibleEvents.length === 0 &&
      visibleEventsIgnoringHashtagLimit.length > 0,
    mediaOnlyFilteredOutAll:
      mediaOnly && visibleEvents.length === 0 && visibleEventsIgnoringMediaOnly.length > 0,
    visibleEvents
  }
}
