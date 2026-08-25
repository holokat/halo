import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PERSONAL_MEDIA_BLOSSOM_SERVER,
  PERSONAL_MEDIA_OWNER_PUBKEY,
  getPersonalMediaBlossomServers
} from './personal-media-routing.ts'

test('routes the private-media owner exclusively through the personal Blossom server', () => {
  assert.deepEqual(getPersonalMediaBlossomServers(PERSONAL_MEDIA_OWNER_PUBKEY), [
    PERSONAL_MEDIA_BLOSSOM_SERVER
  ])
  assert.deepEqual(
    getPersonalMediaBlossomServers(`  ${PERSONAL_MEDIA_OWNER_PUBKEY.toUpperCase()}  `),
    [PERSONAL_MEDIA_BLOSSOM_SERVER]
  )
})

test('leaves upload routing unchanged for every other account', () => {
  assert.equal(getPersonalMediaBlossomServers('f'.repeat(64)), null)
  assert.equal(getPersonalMediaBlossomServers(null), null)
  assert.equal(getPersonalMediaBlossomServers(undefined), null)
})
