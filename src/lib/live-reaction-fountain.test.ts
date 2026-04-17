import assert from 'node:assert/strict'
import test from 'node:test'
import type { Event as NostrEvent } from 'nostr-tools'
import {
  getLiveReactionFountainBonusCount,
  getLiveReactionFountainBurstProgress,
  getLiveReactionFountainParticleCount,
  getLiveReactionFountainPayloadFromEvent,
  getLiveReactionFountainVisual,
  getReactionTargetCoordinate,
  getReactionTargetEventId,
  isReactionTargetingPubkey
} from './live-reaction-fountain.ts'

function createReactionEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: '1'.repeat(64),
    pubkey: '2'.repeat(64),
    created_at: 1,
    kind: 7,
    content: '+',
    tags: [['p', '3'.repeat(64)]],
    sig: '',
    ...overrides
  } as NostrEvent
}

test('generic likes are normalized to a heart particle', () => {
  assert.deepEqual(getLiveReactionFountainVisual(createReactionEvent({ content: '+' })), {
    kind: 'heart',
    emoji: '+'
  })
  assert.deepEqual(getLiveReactionFountainVisual(createReactionEvent({ content: '   ' })), {
    kind: 'heart',
    emoji: '+'
  })
})

test('plain emoji reactions are preserved as text', () => {
  assert.deepEqual(getLiveReactionFountainVisual(createReactionEvent({ content: '😂' })), {
    kind: 'emoji',
    emoji: '😂'
  })
})

test('custom emoji reactions resolve image URLs from emoji tags', () => {
  assert.deepEqual(
    getLiveReactionFountainVisual(
      createReactionEvent({
        content: ':party_blob:',
        tags: [
          ['p', '3'.repeat(64)],
          ['emoji', 'party_blob', 'https://cdn.example.com/party-blob.webp']
        ]
      })
    ),
    {
      kind: 'customEmoji',
      emoji: {
        shortcode: 'party_blob',
        url: 'https://cdn.example.com/party-blob.webp'
      }
    }
  )
})

test('reaction target helpers read the latest e and a tags', () => {
  const event = createReactionEvent({
    tags: [
      ['p', '3'.repeat(64)],
      ['e', '4'.repeat(64)],
      ['a', `30023:${'5'.repeat(64)}:post`],
      ['e', '6'.repeat(64)]
    ]
  })

  assert.equal(getReactionTargetEventId(event), '6'.repeat(64))
  assert.equal(getReactionTargetCoordinate(event), `30023:${'5'.repeat(64)}:post`)
})

test('reaction target helper only accepts events aimed at the signed-in user', () => {
  const targetPubkey = '3'.repeat(64)
  assert.equal(isReactionTargetingPubkey(createReactionEvent(), targetPubkey), true)
  assert.equal(
    isReactionTargetingPubkey(createReactionEvent({ tags: [['p', '9'.repeat(64)]] }), targetPubkey),
    false
  )
})

test('bonus reactions expose capped fountain burst sizing', () => {
  assert.equal(
    getLiveReactionFountainBonusCount(
      createReactionEvent({
        tags: [
          ['p', '3'.repeat(64)],
          ['reaction_bonus', '5']
        ]
      })
    ),
    5
  )
  assert.equal(getLiveReactionFountainParticleCount(0), 1)
  assert.equal(getLiveReactionFountainParticleCount(3), 4)
  assert.equal(getLiveReactionFountainParticleCount(50), 16)
  assert.ok(getLiveReactionFountainBurstProgress(12) > getLiveReactionFountainBurstProgress(2))
})

test('payload helper ignores self reactions and keeps bonus metadata', () => {
  const activePubkey = '3'.repeat(64)

  assert.equal(
    getLiveReactionFountainPayloadFromEvent(
      createReactionEvent({
        pubkey: activePubkey
      }),
      {
        activePubkey,
        relayUrl: 'wss://relay.example.com'
      }
    ),
    null
  )

  assert.deepEqual(
    getLiveReactionFountainPayloadFromEvent(
      createReactionEvent({
        content: '🔥',
        tags: [
          ['p', activePubkey],
          ['reaction_bonus', '4'],
          ['e', '4'.repeat(64)]
        ]
      }),
      {
        activePubkey,
        relayUrl: 'wss://relay.example.com'
      }
    ),
    {
      id: '1'.repeat(64),
      authorPubkey: '2'.repeat(64),
      createdAt: 1,
      relayUrl: 'wss://relay.example.com',
      bonusCount: 4,
      targetEventId: '4'.repeat(64),
      targetCoordinate: undefined,
      visual: {
        kind: 'emoji',
        emoji: '🔥'
      }
    }
  )
})
