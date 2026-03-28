import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHashtagFeedSubRequests,
  buildInterestsFeedHashtags,
  createInterestsCustomFeed,
  getCustomFeedHashtags,
  normalizeCustomFeedHashtag
} from './interests-feed'

test('normalizeCustomFeedHashtag strips hash, spaces, and casing', () => {
  assert.equal(normalizeCustomFeedHashtag(' #Sportstr '), 'sportstr')
})

test('buildInterestsFeedHashtags expands selected interests into deduped hashtags', () => {
  assert.deepEqual(buildInterestsFeedHashtags(['sports', 'music']), [
    'sports',
    'sportstr',
    'music',
    'musicstr'
  ])
})

test('buildHashtagFeedSubRequests creates one hashtag request per normalized hashtag', () => {
  assert.deepEqual(buildHashtagFeedSubRequests(['#Tech', 'music', 'tech'], ['wss://relay.test']), [
    { urls: ['wss://relay.test'], filter: { '#t': ['tech'] } },
    { urls: ['wss://relay.test'], filter: { '#t': ['music'] } }
  ])
})

test('createInterestsCustomFeed stores normalized hashtags for the Interests feed', () => {
  const feed = createInterestsCustomFeed(['#Tech', 'tech', 'nostr'])

  assert.equal(feed.id, 'interests')
  assert.equal(feed.name, 'Interests')
  assert.deepEqual(getCustomFeedHashtags(feed), ['tech', 'nostr'])
  assert.equal(feed.searchParams.type, 'hashtag')
  assert.equal(feed.searchParams.input, '#tech #nostr')
})
