import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProfileFeedTabs } from './profile-feed-tabs'

test('profile tabs omit removed tabs and profile reads unless reads are explicitly shown', () => {
  const defaultTabs = buildProfileFeedTabs({
    lowBandwidthMode: false,
    myPubkey: 'viewer',
    pubkey: 'author',
    showReadsInProfiles: false
  })

  assert.deepEqual(
    defaultTabs.map((tab) => tab.value),
    ['posts', 'postsAndReplies', 'media', 'you']
  )

  const tabsWithReads = buildProfileFeedTabs({
    lowBandwidthMode: false,
    myPubkey: 'viewer',
    pubkey: 'author',
    showReadsInProfiles: true
  })

  assert.deepEqual(
    tabsWithReads.map((tab) => tab.value),
    ['posts', 'postsAndReplies', 'media', 'reads', 'you']
  )
})
