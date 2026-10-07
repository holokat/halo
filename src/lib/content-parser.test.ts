import assert from 'node:assert/strict'
import test from 'node:test'
import { nip19 } from 'nostr-tools'
import { EmbeddedEventParser, EmbeddedUrlParser, parseContent } from './content-parser'
import { getRenderableQuoteReferences } from './event-references'

const id = 'f'.repeat(64)
const nevent = nip19.neventEncode({ id, relays: ['wss://relay.example'] })

test('bare nevent becomes a note embed and does not duplicate its q-tag preview', () => {
  const content = `My comment\n${nevent}`
  const nodes = parseContent(content, [EmbeddedEventParser])
  assert.equal(nodes.filter((node) => node.type === 'event').length, 1)
  assert.deepEqual(
    nodes.find((node) => node.type === 'event'),
    {
      type: 'event',
      data: `nostr:${nevent}`
    }
  )
  const comment = nodes.find((node) => node.type === 'text')?.data
  assert.equal(typeof comment === 'string' ? comment.trim() : undefined, 'My comment')
  assert.deepEqual(getRenderableQuoteReferences({ content, tags: [['q', id]] }), [])
})

test('the reported Ditto reference renders as an event rather than raw text', () => {
  const reportedReference =
    'nevent1qgstc2926kck0uca6d7xdkxft4qqceq3mqe8tmgjc5z0vzt968u7a3sqyq9he2mewvz405jenjddpz84g50a8gjl4jvzp9uf3cjdv70dme8p2flj4n8'
  assert.deepEqual(parseContent(reportedReference, [EmbeddedEventParser]), [
    { type: 'event', data: `nostr:${reportedReference}` }
  ])

  // The reported post also contains a different, prefixed quote. Keep both actual notes.
  const secondReference =
    'nevent1qgstc2926kck0uca6d7xdkxft4qqceq3mqe8tmgjc5z0vzt968u7a3spzemhxue69uhhyetvv9ujuerfw36x7tnsw43z7qpq6n7x46t03lfde9k23qytvy90gd8g8zttx7tr4vgkd4t6tc95yn9qszzxf5'
  const content = `${reportedReference}\n\nnostr:${secondReference}`
  assert.deepEqual(
    parseContent(content, [EmbeddedEventParser]).filter((node) => node.type === 'event'),
    [
      { type: 'event', data: `nostr:${reportedReference}` },
      { type: 'event', data: `nostr:${secondReference}` }
    ]
  )
  assert.deepEqual(
    getRenderableQuoteReferences({
      content,
      tags: [['q', 'd4fc6ae96f8fd2dc96ca8808b610af434e83896b37963ab1166d57a5e0b424ca']]
    }),
    []
  )
})

test('bare and prefixed note, nevent, and naddr references preserve surrounding text', () => {
  const refs = [
    nip19.noteEncode(id),
    nevent,
    nip19.naddrEncode({ kind: 30023, pubkey: 'a'.repeat(64), identifier: 'article' })
  ]
  for (const ref of refs) {
    for (const prefix of ['', 'nostr:']) {
      assert.deepEqual(parseContent(`Read (${prefix}${ref}), please.`, [EmbeddedEventParser]), [
        { type: 'text', data: 'Read (' },
        { type: 'event', data: `nostr:${ref}` },
        { type: 'text', data: '), please.' }
      ])
    }
  }
})

test('invalid references and references inside words or URLs remain unchanged', () => {
  for (const content of [
    'nevent1invalid',
    'nostr:nevent1invalid',
    `prefix${nevent}`,
    `${nevent}suffix`,
    `https://example.com/${nevent}`,
    `https://example.com/?ref=${nevent}`,
    `name@${nevent}`
  ]) {
    assert.deepEqual(parseContent(content, [EmbeddedEventParser]), [
      { type: 'text', data: content }
    ])
  }
})

test('multiple quote references and normal URLs keep their distinct node types', () => {
  const note = nip19.noteEncode('a'.repeat(64))
  const nodes = parseContent(`${nevent} https://example.com/ ${note}`, [
    EmbeddedUrlParser,
    EmbeddedEventParser
  ])
  assert.deepEqual(
    nodes.filter((node) => node.type !== 'text'),
    [
      { type: 'event', data: `nostr:${nevent}` },
      { type: 'url', data: 'https://example.com/' },
      { type: 'event', data: `nostr:${note}` }
    ]
  )
})
