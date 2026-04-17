import test from 'node:test'
import assert from 'node:assert/strict'
import { pickNoteStatsRelayUrls } from './query-plan'

test('pickNoteStatsRelayUrls scores author write relays instead of read relays', () => {
  const relayUrls = pickNoteStatsRelayUrls([
    {
      read: ['wss://read-only.example.com/'],
      write: ['wss://write-only.example.com/']
    }
  ])

  assert.ok(relayUrls.includes('wss://write-only.example.com/'))
  assert.ok(!relayUrls.includes('wss://read-only.example.com/'))
})
