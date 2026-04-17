import { EMBEDDED_EVENT_REGEX } from '@/constants'
import { Event, nip19 } from 'nostr-tools'

export type TQuoteReference =
  | {
      type: 'event'
      id: string
      relays: string[]
    }
  | {
      type: 'address'
      coordinate: string
      relays: string[]
    }

function getQuoteReferenceKey(ref: TQuoteReference) {
  return ref.type === 'event' ? `event:${ref.id}` : `address:${ref.coordinate}`
}

function addUniqueReference(refs: TQuoteReference[], ref: TQuoteReference, seenKeys: Set<string>) {
  const key = getQuoteReferenceKey(ref)
  if (seenKeys.has(key)) {
    return
  }

  seenKeys.add(key)
  refs.push(ref)
}

function isHexEventId(value: string) {
  return /^[0-9a-f]{64}$/i.test(value)
}

function parseReplaceableCoordinate(value: string) {
  const firstColonIndex = value.indexOf(':')
  const secondColonIndex = value.indexOf(':', firstColonIndex + 1)

  if (firstColonIndex <= 0 || secondColonIndex <= firstColonIndex + 1) {
    return null
  }

  const kind = value.slice(0, firstColonIndex)
  const pubkey = value.slice(firstColonIndex + 1, secondColonIndex)
  const identifier = value.slice(secondColonIndex + 1)

  if (!/^\d+$/.test(kind) || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    return null
  }

  return {
    kind: Number(kind),
    pubkey,
    identifier
  }
}

export function getEmbeddedEventReferences(content: string): TQuoteReference[] {
  const refs: TQuoteReference[] = []
  const seenKeys = new Set<string>()

  for (const match of content.match(EMBEDDED_EVENT_REGEX) || []) {
    try {
      const encodedId = match.split(':')[1]
      const { type, data } = nip19.decode(encodedId)

      if (type === 'nevent') {
        addUniqueReference(
          refs,
          { type: 'event', id: data.id, relays: data.relays ?? [] },
          seenKeys
        )
      } else if (type === 'note') {
        addUniqueReference(refs, { type: 'event', id: data, relays: [] }, seenKeys)
      } else if (type === 'naddr') {
        addUniqueReference(
          refs,
          {
            type: 'address',
            coordinate: `${data.kind}:${data.pubkey}:${data.identifier}`,
            relays: data.relays ?? []
          },
          seenKeys
        )
      }
    } catch {
      // Ignore invalid nostr references in content.
    }
  }

  return refs
}

export function getQuoteTagReferences(tags: string[][]): TQuoteReference[] {
  const refs: TQuoteReference[] = []
  const seenKeys = new Set<string>()

  for (const [tagName, value, relay] of tags) {
    if (tagName !== 'q' || !value) {
      continue
    }

    if (isHexEventId(value)) {
      addUniqueReference(
        refs,
        {
          type: 'event',
          id: value,
          relays: relay ? [relay] : []
        },
        seenKeys
      )
      continue
    }

    if (parseReplaceableCoordinate(value)) {
      addUniqueReference(
        refs,
        {
          type: 'address',
          coordinate: value,
          relays: relay ? [relay] : []
        },
        seenKeys
      )
    }
  }

  return refs
}

export function getEmbeddedEventHexIdsFromContent(content: string) {
  return getEmbeddedEventReferences(content)
    .filter((ref): ref is Extract<TQuoteReference, { type: 'event' }> => ref.type === 'event')
    .map((ref) => ref.id)
}

export function getEmbeddedReplaceableCoordinatesFromContent(content: string) {
  return getEmbeddedEventReferences(content)
    .filter((ref): ref is Extract<TQuoteReference, { type: 'address' }> => ref.type === 'address')
    .map((ref) => ref.coordinate)
}

export function getQuotedEventHexIdsFromTags(tags: string[][]) {
  return getQuoteTagReferences(tags)
    .filter((ref): ref is Extract<TQuoteReference, { type: 'event' }> => ref.type === 'event')
    .map((ref) => ref.id)
}

export function getQuotedReplaceableCoordinatesFromTags(tags: string[][]) {
  return getQuoteTagReferences(tags)
    .filter((ref): ref is Extract<TQuoteReference, { type: 'address' }> => ref.type === 'address')
    .map((ref) => ref.coordinate)
}

export function getRenderableQuoteReferences(event: Pick<Event, 'tags' | 'content'>): TQuoteReference[] {
  const embeddedKeys = new Set(
    getEmbeddedEventReferences(event.content).map((ref) => getQuoteReferenceKey(ref))
  )

  return getQuoteTagReferences(event.tags).filter(
    (ref) => !embeddedKeys.has(getQuoteReferenceKey(ref))
  )
}

export function encodeQuoteReference(ref: TQuoteReference) {
  if (ref.type === 'event') {
    return nip19.neventEncode({
      id: ref.id,
      relays: ref.relays
    })
  }

  const coordinate = parseReplaceableCoordinate(ref.coordinate)
  if (!coordinate) {
    return ref.coordinate
  }

  return nip19.naddrEncode({
    kind: coordinate.kind,
    pubkey: coordinate.pubkey,
    identifier: coordinate.identifier,
    relays: ref.relays
  })
}
