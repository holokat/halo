import assert from 'node:assert/strict'
import test from 'node:test'
import { nip19 } from 'nostr-tools'
import { buildInviteUrl, decodeInviteNpub, removeInviteParam } from './invite'

const PUBKEY = '1'.repeat(64)
const NPUB = nip19.npubEncode(PUBKEY)

test('buildInviteUrl creates a root invite link for a valid public key', () => {
  assert.equal(buildInviteUrl(PUBKEY, 'https://haloapp.fyi'), `https://haloapp.fyi/?invite=${NPUB}`)
})

test('buildInviteUrl rejects invalid public keys and origins', () => {
  assert.equal(buildInviteUrl('invalid', 'https://haloapp.fyi'), null)
  assert.equal(buildInviteUrl(PUBKEY, 'not-an-origin'), null)
})

test('decodeInviteNpub accepts npub values and rejects other invite parameters', () => {
  assert.equal(decodeInviteNpub(NPUB), PUBKEY)
  assert.equal(decodeInviteNpub(nip19.noteEncode(PUBKEY)), null)
  assert.equal(decodeInviteNpub('not-an-npub'), null)
  assert.equal(decodeInviteNpub(null), null)
})

test('removeInviteParam preserves the remaining query and hash', () => {
  const url = new URL(`https://haloapp.fyi/search?q=nostr&invite=${NPUB}#people`)
  assert.equal(removeInviteParam(url), '/search?q=nostr#people')
})
