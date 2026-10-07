import assert from 'node:assert/strict'
import test from 'node:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { JSONContent } from '@tiptap/react'
import { nip19, type Event } from 'nostr-tools'
import {
  COMPOSER_QUOTE_NODE,
  getComposerFocusPosition,
  getComposerQuoteId,
  isComposerQuoteForEvent,
  normalizeComposerQuotes,
  serializeComposerQuote
} from './composer-quotes.ts'
import { getEmbeddedEventReferences } from './event-references.ts'

const eventId = 'a'.repeat(64)
const author = 'b'.repeat(64)
const quoteId = nip19.neventEncode({
  id: eventId,
  author,
  kind: 1,
  relays: ['wss://relay.damus.io']
})
const quote = { type: COMPOSER_QUOTE_NODE, attrs: { id: quoteId } }
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline' },
    [COMPOSER_QUOTE_NODE]: { group: 'block', atom: true, attrs: { id: {} } }
  }
})

test('a fresh quote opens with an editable paragraph above the quoted note', () => {
  const content = normalizeComposerQuotes(`\nnostr:${quoteId}`) as JSONContent
  assert.deepEqual(content.content, [{ type: 'paragraph' }, quote])
  const doc = schema.nodeFromJSON(content)
  const position = getComposerFocusPosition(doc)
  assert.equal(position, 1)
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, position as number)
  })
  const typed = state.tr.insertText('My comment').doc
  assert.equal(typed.firstChild?.textContent, 'My comment')
  assert.equal(typed.lastChild?.type.name, COMPOSER_QUOTE_NODE)
  assert.equal(typed.lastChild?.attrs.id, quoteId)
})

test('existing quote drafts retain comments and put focus at the end of the comment above the card', () => {
  const content = normalizeComposerQuotes({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'My saved comment' },
          { type: 'hardBreak' },
          { type: 'text', text: `nostr:${quoteId}` }
        ]
      }
    ]
  }) as JSONContent
  assert.deepEqual(content.content, [
    { type: 'paragraph', content: [{ type: 'text', text: 'My saved comment' }] },
    quote
  ])
  const doc = schema.nodeFromJSON(content)
  const selection = TextSelection.create(doc, getComposerFocusPosition(doc) as number)
  assert.equal(selection.$from.parent.type.name, 'paragraph')
  assert.equal(selection.$from.parentOffset, 'My saved comment'.length)
})

test('normalization preserves mentions, emoji, and marks around standalone quote lines', () => {
  const mention = { type: 'mention', attrs: { id: nip19.npubEncode(author) } }
  const emoji = { type: 'emoji', attrs: { name: 'smile' } }
  const text = { type: 'text', text: 'Comment', marks: [{ type: 'bold' }] }
  const content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [mention, text, emoji, { type: 'hardBreak' }, { type: 'text', text: quoteId }]
      }
    ]
  }
  const before = structuredClone(content)
  const normalized = normalizeComposerQuotes(content) as JSONContent
  assert.deepEqual(normalized.content?.[0].content, [mention, text, emoji])
  assert.deepEqual(normalized.content?.[1], quote)
  assert.deepEqual(content, before)
})

test('ordinary posts and inline or invalid references stay editable without quote conversion', () => {
  for (const value of [
    'A normal post',
    `Inline nostr:${quoteId} stays inline`,
    'nostr:nevent1invalid',
    nip19.npubEncode(author)
  ]) {
    assert.equal(normalizeComposerQuotes(value), value)
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: value }] }
    const doc = { type: 'doc', content: [paragraph] }
    assert.deepEqual(normalizeComposerQuotes(doc), doc)
  }
  assert.equal(
    getComposerFocusPosition(
      schema.nodeFromJSON({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Normal post' }] }]
      })
    ),
    'end'
  )
})

test('saved quote cards and array drafts survive repeated normalization and JSON persistence', () => {
  const first = normalizeComposerQuotes([quote]) as JSONContent
  const restored = normalizeComposerQuotes(JSON.parse(JSON.stringify(first)))
  assert.deepEqual(restored, first)
  assert.deepEqual(first.content, [{ type: 'paragraph' }, quote])
})

test('multiple quoted notes retain their order and surrounding text', () => {
  const secondId = nip19.noteEncode('c'.repeat(64))
  const content = normalizeComposerQuotes({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `Before\nnostr:${quoteId}\nBetween\nnostr:${secondId}\nAfter` }
        ]
      }
    ]
  }) as JSONContent
  assert.deepEqual(
    content.content?.map((node) => node.type),
    ['paragraph', COMPOSER_QUOTE_NODE, 'paragraph', COMPOSER_QUOTE_NODE, 'paragraph']
  )
  assert.equal(content.content?.[1].attrs?.id, quoteId)
  assert.equal(content.content?.[3].attrs?.id, secondId)
  assert.equal(content.content?.[4].content?.[0].text, 'After')
})

test('quote serialization preserves event and address references for publishing', () => {
  const addressId = nip19.naddrEncode({ pubkey: author, kind: 30023, identifier: 'test-article' })
  for (const id of [quoteId, nip19.noteEncode(eventId), addressId]) {
    assert.equal(getComposerQuoteId(`nostr:${id}`), id)
    assert.equal(serializeComposerQuote(id), `nostr:${id}\n`)
    const refs = getEmbeddedEventReferences(`My comment\n${serializeComposerQuote(id)}`)
    assert.equal(refs.length, 1)
    assert.deepEqual(
      nip19.decode(id).type === 'naddr' ? refs[0] : refs[0].type,
      nip19.decode(id).type === 'naddr'
        ? { type: 'address', coordinate: `30023:${author}:test-article`, relays: [] }
        : 'event'
    )
    if (refs[0].type === 'event') assert.equal(refs[0].id, eventId)
  }
  assert.equal(serializeComposerQuote('invalid'), '')
})

test('removing a quote preserves the comment and returns to normal composer focus', () => {
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep my comment' }] }, quote]
  })
  const position = doc.firstChild!.nodeSize
  const nextDoc = EditorState.create({ doc }).tr.delete(position, position + 1).doc
  assert.equal(nextDoc.textContent, 'Keep my comment')
  assert.equal(nextDoc.childCount, 1)
  assert.equal(getComposerFocusPosition(nextDoc), 'end')
})

test('the immediate preview only uses the event matching the quote, including addressable notes', () => {
  const event: Event = {
    id: eventId,
    pubkey: author,
    kind: 1,
    created_at: 0,
    tags: [],
    content: '',
    sig: ''
  }
  assert.equal(isComposerQuoteForEvent(quoteId, event), true)
  assert.equal(isComposerQuoteForEvent(nip19.noteEncode(eventId), event), true)
  assert.equal(isComposerQuoteForEvent(nip19.noteEncode('c'.repeat(64)), event), false)
  const article = { ...event, kind: 30023, tags: [['d', 'test-article']] }
  const addressId = nip19.naddrEncode({ pubkey: author, kind: 30023, identifier: 'test-article' })
  assert.equal(isComposerQuoteForEvent(addressId, article), true)
  assert.equal(isComposerQuoteForEvent(addressId, event), false)
  assert.equal(isComposerQuoteForEvent('invalid', event), false)
})
