import test from 'node:test'
import assert from 'node:assert/strict'
import { getCustomFeedSubRequests } from './custom-feed'
import { createInterestsCustomFeed } from './interests-feed'

test('interests feed combines hashtags into a single relay request', () => {
  const feed = createInterestsCustomFeed(['#Tech', 'nostr', 'Music'])

  assert.deepEqual(getCustomFeedSubRequests(feed), [
    {
      urls: [
        'wss://relay.damus.io/',
        'wss://nos.lol/',
        'wss://relay.nostr.band/',
        'wss://nostr.mom/'
      ],
      filter: { '#t': ['tech', 'nostr', 'music'] }
    }
  ])
})
