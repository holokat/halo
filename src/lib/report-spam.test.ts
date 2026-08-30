import assert from 'node:assert/strict'
import test from 'node:test'
import { applyLocalSpamMarkForReport } from './report-spam.ts'

test('a successful spam report marks its author locally once', () => {
  const markedPubkeys: string[] = []

  const didMark = applyLocalSpamMarkForReport('spam', 'ABC', (pubkey) => {
    markedPubkeys.push(pubkey)
  })

  assert.equal(didMark, true)
  assert.deepEqual(markedPubkeys, ['ABC'])
})

test('other report reasons do not create a local spam mark', () => {
  const markedPubkeys: string[] = []

  const didMark = applyLocalSpamMarkForReport('malware', 'ABC', (pubkey) => {
    markedPubkeys.push(pubkey)
  })

  assert.equal(didMark, false)
  assert.deepEqual(markedPubkeys, [])
})
