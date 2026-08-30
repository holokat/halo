import assert from 'node:assert/strict'
import test from 'node:test'
import { Event } from 'nostr-tools'
import {
  partitionReplySpam,
  reconcileSpamRepliesExpansionScope,
  reconcileSpamRepliesExpanded,
  REPLY_SPAM_SCORE_THRESHOLD
} from './reply-spam.ts'

function reply(id: string, pubkey: string): Event {
  return {
    id,
    pubkey,
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    sig: '0'.repeat(128)
  }
}

function partition(
  events: Event[],
  options: Partial<Parameters<typeof partitionReplySpam>[1]> = {}
) {
  return partitionReplySpam(events, {
    enabled: true,
    signature: 'test-signature',
    cachedScore: () => 0,
    ...options
  })
}

test('an explicit spam mark stays hidden when a trusted child appears', () => {
  const marked = reply('marked', 'MARKED')
  const trustedChild = reply('trusted-child', 'trusted')

  const result = partition([marked, trustedChild], {
    markedPubkeys: new Set(['marked'])
  })

  assert.deepEqual(
    result.visible.map((event) => event.id),
    ['trusted-child']
  )
  assert.deepEqual(
    result.hidden.map((event) => event.id),
    ['marked']
  )
})

test('a likely-spam parent stays hidden after its trusted child arrives', () => {
  const parent = reply('parent', 'likely-spam')
  const trustedChild = reply('trusted-child', 'trusted')

  const result = partition([parent, trustedChild], {
    cachedScore: (pubkey) => (pubkey === 'likely-spam' ? REPLY_SPAM_SCORE_THRESHOLD : 0)
  })

  assert.deepEqual(result.visible, [trustedChild])
  assert.deepEqual(result.hidden, [parent])
})

test('an explicit spam mark stays hidden when unrelated replies are added', () => {
  const marked = reply('marked', 'marked')
  const unrelated = reply('unrelated', 'unrelated')

  const result = partition([marked, unrelated], {
    markedPubkeys: new Set(['marked'])
  })

  assert.deepEqual(
    result.visible.map((event) => event.id),
    ['unrelated']
  )
  assert.deepEqual(
    result.hidden.map((event) => event.id),
    ['marked']
  )
})

test('cache misses remain hidden and queue each author once', () => {
  const first = reply('first', 'PENDING')
  const second = reply('second', 'pending')

  const result = partition([first, second], { cachedScore: () => undefined })

  assert.deepEqual(result.visible, [])
  assert.deepEqual(result.hidden, [])
  assert.deepEqual(result.pending, [first, second])
  assert.deepEqual(result.pendingPubkeys, ['pending'])
})

test('current user, safelisted authors, and followed authors are visible without scores', () => {
  const current = reply('current', 'current')
  const safelisted = reply('safelisted', 'safe')
  const followed = reply('followed', 'followed')
  const scoresRequested: string[] = []

  const result = partition([current, safelisted, followed], {
    currentPubkey: 'CURRENT',
    safelistedPubkeys: new Set(['safe']),
    followedPubkeys: new Set(['followed']),
    cachedScore: (pubkey) => {
      scoresRequested.push(pubkey)
      return undefined
    }
  })

  assert.deepEqual(result.visible, [current, safelisted, followed])
  assert.deepEqual(scoresRequested, [])
})

test('disabling automatic filtering keeps explicit marks hidden but reveals inferred and pending replies', () => {
  const marked = reply('marked', 'marked')
  const inferred = reply('inferred', 'inferred')
  const pending = reply('pending', 'pending')

  const result = partition([marked, inferred, pending], {
    enabled: false,
    markedPubkeys: new Set(['marked']),
    cachedScore: () => undefined
  })

  assert.deepEqual(result.visible, [inferred, pending])
  assert.deepEqual(result.hidden, [marked])
  assert.deepEqual(result.pending, [])
  assert.deepEqual(result.pendingPubkeys, [])
})

test('scores at the spam threshold are hidden and lower scores are visible', () => {
  const hidden = reply('hidden', 'hidden')
  const visible = reply('visible', 'visible')

  const result = partition([hidden, visible], {
    cachedScore: (pubkey) => (pubkey === 'hidden' ? REPLY_SPAM_SCORE_THRESHOLD : 0.84)
  })

  assert.deepEqual(result.visible, [visible])
  assert.deepEqual(result.hidden, [hidden])
})

test('the expanded spam group stays expanded as new hidden replies arrive', () => {
  assert.equal(reconcileSpamRepliesExpanded(true, 2), true)
  assert.equal(reconcileSpamRepliesExpanded(true, 3), true)
  assert.equal(reconcileSpamRepliesExpanded(true, 0), false)
})

test('the expanded spam group closes when its account, personalization, or thread scope changes', () => {
  assert.equal(reconcileSpamRepliesExpansionScope('same-scope', 'same-scope', 2), 'same-scope')
  assert.equal(reconcileSpamRepliesExpansionScope('old-scope', 'new-scope', 2), undefined)
  assert.equal(reconcileSpamRepliesExpansionScope('same-scope', 'same-scope', 0), undefined)
})
