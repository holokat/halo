import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSpamMarkedEvents, isSpamMarkedPubkey } from './spam-filter.ts'

test('manual spam marks match normalized author pubkeys', () => {
  const markedPubkeys = new Set(['marked'])

  assert.equal(isSpamMarkedPubkey(' MARKED ', markedPubkeys), true)
  assert.equal(isSpamMarkedPubkey('visible', markedPubkeys), false)
})

test('manual spam marks remove authored events from compact content collections', () => {
  const events = [
    { id: 'hidden', pubkey: 'MARKED' },
    { id: 'visible', pubkey: 'visible' }
  ]

  assert.deepEqual(filterSpamMarkedEvents(events, new Set(['marked'])), [events[1]])
})
