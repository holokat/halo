import { createReactionDraftEvent } from '@/lib/draft-event'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { TDraftEvent, TEmoji, TNoteReaction } from '@/types'
import { Event, getEventHash, kinds, UnsignedEvent, VerifiedEvent } from 'nostr-tools'

export type TOptimisticReactionPublishState = 'published' | 'partial'
export type TOptimisticReactionOptions = {
  bonusCount?: number
}

function createOptimisticReactionEvent(draftEvent: TDraftEvent, pubkey: string): Event {
  const unsignedReaction: UnsignedEvent = {
    ...draftEvent,
    pubkey
  }

  return {
    ...unsignedReaction,
    id: getEventHash(unsignedReaction),
    sig: ''
  } as Event
}

function createReactionEventFromRecord(targetEvent: Event, reaction: TNoteReaction): Event {
  const draftEvent = createReactionDraftEvent(targetEvent, reaction.emoji, {
    bonusCount: reaction.bonusCount
  })

  return {
    ...draftEvent,
    id: reaction.id,
    pubkey: reaction.pubkey,
    created_at: reaction.created_at,
    kind: kinds.Reaction,
    sig: ''
  } as Event
}

export function beginOptimisticReaction(
  targetEvent: Event,
  emoji: string | TEmoji,
  pubkey: string,
  signEvent: (draftEvent: TDraftEvent) => Promise<VerifiedEvent>,
  { bonusCount = 0 }: TOptimisticReactionOptions = {}
) {
  const draftReaction = createReactionDraftEvent(targetEvent, emoji, { bonusCount })
  const optimisticReaction = createOptimisticReactionEvent(draftReaction, pubkey)
  noteStatsService.updateNoteStatsByEvents([optimisticReaction])

  const publishTask = (async (): Promise<TOptimisticReactionPublishState> => {
    let signedReaction: VerifiedEvent | null = null

    try {
      signedReaction = await signEvent(draftReaction)

      if (signedReaction.id !== optimisticReaction.id) {
        noteStatsService.removeInteractionById(optimisticReaction.id)
        noteStatsService.updateNoteStatsByEvents([signedReaction])
      }

      const seenOn = client.getSeenEventRelayUrls(targetEvent.id)
      const relays = await client.determineTargetRelays(signedReaction, {
        additionalRelayUrls: seenOn
      })
      await client.publishEvent(relays, signedReaction)
      return 'published'
    } catch (error) {
      const reactionId = signedReaction?.id ?? optimisticReaction.id

      // Keep the optimistic reaction if at least one relay accepted it.
      if (!signedReaction || client.getSeenEventRelayUrls(reactionId).length === 0) {
        noteStatsService.removeInteractionById(reactionId)
        throw error
      }

      return 'partial'
    }
  })()

  return { reaction: optimisticReaction, publishTask }
}

export function beginOptimisticReactionRemoval(
  targetEvent: Event,
  reaction: TNoteReaction,
  attemptDelete: (targetEvent: Event) => Promise<void>
) {
  const reactionEvent = createReactionEventFromRecord(targetEvent, reaction)
  noteStatsService.removeInteractionById(reaction.id)

  const deleteTask = (async () => {
    try {
      await attemptDelete(reactionEvent)
    } catch (error) {
      noteStatsService.updateNoteStatsByEvents([reactionEvent])
      throw error
    }
  })()

  return { reaction: reactionEvent, deleteTask }
}
