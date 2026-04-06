import { EMBEDDED_EVENT_REGEX, ExtendedKind } from '@/constants'
import client from '@/services/client.service'
import { Event, nip19 } from 'nostr-tools'
import { getReplaceableCoordinate, getRootETag, isReplaceableEvent } from './event'
import { buildATag, buildETagWithMarker } from './draft-event.tags'
import { generateBech32IdFromETag, tagNameEquals } from './tag'

function addUnique(arr: string[], item: string) {
  if (!arr.includes(item)) {
    arr.push(item)
  }
}

function extractQuotedReferences(content: string) {
  const quoteEventHexIds: string[] = []
  const quoteReplaceableCoordinates: string[] = []
  const matches = content.match(EMBEDDED_EVENT_REGEX)

  for (const match of matches || []) {
    try {
      const id = match.split(':')[1]
      const { type, data } = nip19.decode(id)
      if (type === 'nevent') {
        addUnique(quoteEventHexIds, data.id)
      } else if (type === 'note') {
        addUnique(quoteEventHexIds, data)
      } else if (type === 'naddr') {
        addUnique(
          quoteReplaceableCoordinates,
          getReplaceableCoordinate(data.kind, data.pubkey, data.identifier)
        )
      }
    } catch (error) {
      console.error(error)
    }
  }

  return {
    quoteEventHexIds,
    quoteReplaceableCoordinates
  }
}

export async function extractRelatedEventIds(content: string, parentEvent?: Event) {
  const { quoteEventHexIds, quoteReplaceableCoordinates } = extractQuotedReferences(content)
  let rootETag: string[] = []
  let parentETag: string[] = []

  if (parentEvent) {
    const existingRootTag = getRootETag(parentEvent)
    if (existingRootTag) {
      parentETag = buildETagWithMarker(parentEvent.id, parentEvent.pubkey, '', 'reply')

      const [, rootEventHexId, hint, , rootEventPubkey] = existingRootTag
      if (rootEventPubkey) {
        rootETag = buildETagWithMarker(rootEventHexId, rootEventPubkey, hint, 'root')
      } else {
        const rootEventId = generateBech32IdFromETag(existingRootTag)
        const rootEvent = rootEventId ? await client.fetchEvent(rootEventId) : undefined
        rootETag = rootEvent
          ? buildETagWithMarker(rootEvent.id, rootEvent.pubkey, hint, 'root')
          : buildETagWithMarker(rootEventHexId, rootEventPubkey, hint, 'root')
      }
    } else {
      rootETag = buildETagWithMarker(parentEvent.id, parentEvent.pubkey, '', 'root')
    }
  }

  return {
    quoteEventHexIds,
    quoteReplaceableCoordinates,
    rootETag,
    parentETag
  }
}

export function extractCommentMentions(content: string, parentEvent: Event) {
  const { quoteEventHexIds, quoteReplaceableCoordinates } = extractQuotedReferences(content)
  const isComment = [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT].includes(parentEvent.kind)
  const rootCoordinateTag = isComment
    ? parentEvent.tags.find(tagNameEquals('A'))
    : isReplaceableEvent(parentEvent.kind)
      ? buildATag(parentEvent, true)
      : undefined
  const rootEventId = isComment ? parentEvent.tags.find(tagNameEquals('E'))?.[1] : parentEvent.id
  const rootKind = isComment ? parentEvent.tags.find(tagNameEquals('K'))?.[1] : parentEvent.kind
  const rootPubkey = isComment ? parentEvent.tags.find(tagNameEquals('P'))?.[1] : parentEvent.pubkey
  const rootUrl = isComment ? parentEvent.tags.find(tagNameEquals('I'))?.[1] : undefined

  return {
    quoteEventHexIds,
    quoteReplaceableCoordinates,
    rootEventId,
    rootCoordinateTag,
    rootKind,
    rootPubkey,
    rootUrl,
    parentEvent
  }
}
