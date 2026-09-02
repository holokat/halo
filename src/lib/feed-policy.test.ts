import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeVisibleFeedInfo } from './feed-policy'

test('visible feed choices remain available for signed-in users', () => {
  assert.deepEqual(normalizeVisibleFeedInfo({ feedType: 'following' }, 'pubkey'), {
    feedType: 'following'
  })
  assert.deepEqual(normalizeVisibleFeedInfo({ feedType: 'trending' }, 'pubkey'), {
    feedType: 'trending'
  })
  assert.deepEqual(normalizeVisibleFeedInfo({ feedType: 'bookmarks' }, 'pubkey'), {
    feedType: 'bookmarks'
  })
})

test('signed-out users fall back to Trending for account feeds', () => {
  assert.deepEqual(normalizeVisibleFeedInfo({ feedType: 'following' }, null), {
    feedType: 'trending'
  })
  assert.deepEqual(normalizeVisibleFeedInfo({ feedType: 'bookmarks' }, null), {
    feedType: 'trending'
  })
})

test('legacy specialist feeds fall back to Trending for presentation without mutating them', () => {
  const hiddenFeeds = [
    { feedType: 'news' as const },
    { feedType: 'custom' as const, id: 'interests' },
    { feedType: 'relay' as const, id: 'wss://relay.example.com' },
    { feedType: 'relays' as const, id: 'set-id' },
    { feedType: 'one-per-person' as const },
    { feedType: 'polls' as const }
  ]

  for (const feedInfo of hiddenFeeds) {
    const originalFeedInfo = structuredClone(feedInfo)
    assert.deepEqual(normalizeVisibleFeedInfo(feedInfo, 'pubkey'), {
      feedType: 'trending'
    })
    assert.deepEqual(feedInfo, originalFeedInfo)
  }
})
