import assert from 'node:assert/strict'
import test from 'node:test'
import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, kinds } from 'nostr-tools'
import * as nip44 from 'nostr-tools/nip44'
import { unwrapDirectMessage } from './decrypt.ts'

function createWrappedDirectMessage({
  senderSecretKey,
  recipientPubkey,
  content
}: {
  senderSecretKey: Uint8Array
  recipientPubkey: string
  content: string
}) {
  const senderPubkey = getPublicKey(senderSecretKey)
  const rumor = {
    created_at: 1,
    kind: kinds.PrivateDirectMessage,
    content,
    tags: [['p', recipientPubkey]],
    pubkey: senderPubkey
  }
  const rumorEvent = {
    ...rumor,
    id: getEventHash(rumor)
  }

  const sealEvent = finalizeEvent(
    {
      kind: kinds.Seal,
      content: nip44.encrypt(
        JSON.stringify(rumorEvent),
        nip44.getConversationKey(senderSecretKey, recipientPubkey)
      ),
      created_at: 2,
      tags: []
    },
    senderSecretKey
  )

  const wrapSecretKey = generateSecretKey()

  return finalizeEvent(
    {
      kind: kinds.GiftWrap,
      content: nip44.encrypt(
        JSON.stringify(sealEvent),
        nip44.getConversationKey(wrapSecretKey, recipientPubkey)
      ),
      created_at: 3,
      tags: [['p', recipientPubkey]]
    },
    wrapSecretKey
  )
}

test('unwrapDirectMessage retries after a transient decrypt failure instead of caching null forever', async () => {
  const senderSecretKey = generateSecretKey()
  const recipientSecretKey = generateSecretKey()
  const recipientPubkey = getPublicKey(recipientSecretKey)
  const wrap = createWrappedDirectMessage({
    senderSecretKey,
    recipientPubkey,
    content: 'hello again'
  })
  const cache = new Map()
  let shouldFail = true

  const decryptForRecipient = async (pubkey: string, cipherText: string) => {
    if (shouldFail) {
      shouldFail = false
      throw new Error('temporary decrypt failure')
    }

    return nip44.decrypt(cipherText, nip44.getConversationKey(recipientSecretKey, pubkey))
  }

  const firstAttempt = await unwrapDirectMessage(wrap, recipientPubkey, decryptForRecipient, cache)
  assert.equal(firstAttempt, null)

  const secondAttempt = await unwrapDirectMessage(wrap, recipientPubkey, decryptForRecipient, cache)
  assert.ok(secondAttempt)
  assert.ok('content' in secondAttempt)
  assert.equal(secondAttempt.content, 'hello again')
  assert.equal(secondAttempt.isOutgoing, false)
})
