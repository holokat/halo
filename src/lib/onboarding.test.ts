import test from 'node:test'
import assert from 'node:assert/strict'
import { formatHandleValue } from './onboarding'

test('formatHandleValue normalizes display names into handle-friendly values', () => {
  assert.equal(formatHandleValue('Mr Bob'), 'mrbob')
  assert.equal(formatHandleValue('  @Alice Jones  '), 'alicejones')
  assert.equal(formatHandleValue('Nostr Fan! 21'), 'nostrfan21')
})
