import assert from 'node:assert/strict'
import test from 'node:test'
import { matchFilter, type Event } from 'nostr-tools'
import { buildReplyFilters } from './reply-query'

const rootId = 'a'.repeat(64)
const parentId = 'b'.repeat(64)

function reply(kind: number, tags: string[][]): Event {
  return {
    id: 'c'.repeat(64),
    pubkey: 'd'.repeat(64),
    created_at: 100,
    kind,
    tags,
    content: 'Test reply',
    sig: '0'.repeat(128)
  }
}

test('kind 1 note query includes legacy replies and kind 1111 comments', () => {
  const filters = buildReplyFilters({ type: 'E', id: rootId }, 100)
  assert.deepEqual(filters, [
    { '#e': [rootId], kinds: [1], limit: 100 },
    { '#E': [rootId], kinds: [1111, 1244], limit: 100 }
  ])
  for (const event of [
    reply(1, [['e', rootId, '', 'root']]),
    reply(1111, [
      ['E', rootId],
      ['K', '1'],
      ['e', rootId],
      ['k', '1']
    ]),
    reply(1244, [
      ['E', rootId],
      ['e', rootId]
    ])
  ]) {
    assert.ok(filters.some((filter) => matchFilter(filter, event)))
  }
})

test('root query includes nested comments and retains scope for pagination and live updates', () => {
  const filters = buildReplyFilters({ type: 'E', id: rootId }, 100)
  const nested = reply(1111, [
    ['E', rootId],
    ['K', '1'],
    ['e', parentId],
    ['k', '1111']
  ])
  assert.ok(filters.some((filter) => matchFilter(filter, nested)))
  assert.ok(
    filters
      .map((filter) => ({ ...filter, until: 100 }))
      .some((filter) => matchFilter(filter, nested))
  )
  assert.ok(
    filters
      .map((filter) => ({ ...filter, since: 100 }))
      .some((filter) => matchFilter(filter, nested))
  )
  assert.ok(
    !filters.some((filter) =>
      matchFilter(
        filter,
        reply(1111, [
          ['E', parentId],
          ['e', parentId]
        ])
      )
    )
  )
  assert.ok(!filters.some((filter) => matchFilter(filter, reply(7, [['e', rootId]]))))
})

test('addressable threads retain legacy replies and NIP-22 comment scopes', () => {
  const coordinate = `30023:${'d'.repeat(64)}:article`
  const filters = buildReplyFilters({ type: 'A', id: coordinate }, 50)
  assert.deepEqual(filters, [
    { '#a': [coordinate], kinds: [1], limit: 50 },
    { '#A': [coordinate], kinds: [1111, 1244], limit: 50 }
  ])
  assert.ok(
    filters.some((filter) =>
      matchFilter(
        filter,
        reply(1111, [
          ['A', coordinate],
          ['e', parentId]
        ])
      )
    )
  )
})

test('external scopes only query comments rather than unrelated kind 1 notes', () => {
  assert.deepEqual(buildReplyFilters({ type: 'I', id: 'https://example.com/article' }, 25), [
    { '#I': ['https://example.com/article'], kinds: [1111, 1244], limit: 25 }
  ])
})
