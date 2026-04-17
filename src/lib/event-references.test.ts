import assert from 'node:assert/strict'
import test from 'node:test'
import {
  encodeQuoteReference,
  getQuotedEventHexIdsFromTags,
  getQuotedReplaceableCoordinatesFromTags,
  getRenderableQuoteReferences
} from './event-references'

const QUOTED_EVENT_ID = 'f'.repeat(64)
const QUOTED_COORDINATE = `30023:${'a'.repeat(64)}:roadmap`

test('getQuotedEventHexIdsFromTags reads event quote references from q tags', () => {
  assert.deepEqual(
    getQuotedEventHexIdsFromTags([
      ['q', QUOTED_EVENT_ID, 'wss://relay.example'],
      ['q', QUOTED_EVENT_ID, 'wss://relay.example']
    ]),
    [QUOTED_EVENT_ID]
  )
})

test('getQuotedReplaceableCoordinatesFromTags reads address quote references from q tags', () => {
  assert.deepEqual(
    getQuotedReplaceableCoordinatesFromTags([
      ['q', QUOTED_COORDINATE],
      ['q', QUOTED_COORDINATE]
    ]),
    [QUOTED_COORDINATE]
  )
})

test('getRenderableQuoteReferences keeps q-tag quotes when content has no embedded nostr URI', () => {
  const refs = getRenderableQuoteReferences({
    content: 'Quoting this the legacy way',
    tags: [['q', QUOTED_EVENT_ID, 'wss://relay.example']]
  })

  assert.deepEqual(refs, [
    {
      type: 'event',
      id: QUOTED_EVENT_ID,
      relays: ['wss://relay.example']
    }
  ])
})

test('getRenderableQuoteReferences suppresses quotes already present as embedded nostr URIs', () => {
  const quotedBech32 = encodeQuoteReference({
    type: 'event',
    id: QUOTED_EVENT_ID,
    relays: ['wss://relay.example']
  })

  const refs = getRenderableQuoteReferences({
    content: `nostr:${quotedBech32}`,
    tags: [['q', QUOTED_EVENT_ID, 'wss://relay.example']]
  })

  assert.deepEqual(refs, [])
})

test('encodeQuoteReference encodes replaceable quote references as naddr ids', () => {
  const encoded = encodeQuoteReference({
    type: 'address',
    coordinate: QUOTED_COORDINATE,
    relays: ['wss://relay.example']
  })

  assert.match(encoded, /^naddr1/)
})
