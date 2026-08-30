import assert from 'node:assert/strict'
import test from 'node:test'
import { partitionReplySpam } from '../lib/reply-spam.ts'
import { NSpamService, type TNSpamPersonalization } from './nspam.service.ts'
import { Event } from 'nostr-tools'

const personalization: TNSpamPersonalization = {
  markedPubkeys: new Set(),
  safelistedPubkeys: new Set(),
  signature: 'no-labels'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

function reply(index: number, pubkey = 'author'): Event {
  return {
    id: index.toString(16).padStart(64, '0'),
    pubkey,
    created_at: 1_700_000_000 + index,
    kind: 1,
    tags: [['e', 'f'.repeat(64), '', 'reply']],
    content: `reply ${index}`,
    sig: '0'.repeat(128)
  }
}

test('a fifth reply invalidates the old author score without making hidden replies visible', async () => {
  const service = new NSpamService({
    classifierLoader: async () => ({
      score: (notes) => (notes.length < 5 ? 0.92 : 0.2)
    })
  })
  const firstFour = [1, 2, 3, 4].map((index) => reply(index))
  service.ingestEvents(firstFour)
  await service.scoreAuthor('author', personalization)

  const beforeNewReply = partitionReplySpam(firstFour, {
    enabled: true,
    signature: personalization.signature,
    cachedScore: (pubkey, signature) => service.cachedScore(pubkey, signature)
  })
  assert.deepEqual(beforeNewReply.visible, [])
  assert.equal(beforeNewReply.hidden.length, 4)

  const fifthReply = reply(5)
  const allReplies = [...firstFour, fifthReply]
  service.ingestEvents([fifthReply])

  const whileRescoring = partitionReplySpam(allReplies, {
    enabled: true,
    signature: personalization.signature,
    cachedScore: (pubkey, signature) => service.cachedScore(pubkey, signature)
  })
  assert.deepEqual(whileRescoring.visible, [])
  assert.deepEqual(whileRescoring.hidden, [])
  assert.equal(whileRescoring.pending.length, 5)
  assert.deepEqual(whileRescoring.pendingPubkeys, ['author'])

  await service.scoreAuthor('author', personalization)
  const afterRescoring = partitionReplySpam(allReplies, {
    enabled: true,
    signature: personalization.signature,
    cachedScore: (pubkey, signature) => service.cachedScore(pubkey, signature)
  })
  assert.equal(afterRescoring.visible.length, 5)
  assert.deepEqual(afterRescoring.hidden, [])
  assert.deepEqual(afterRescoring.pending, [])
})

test('a reply ingested during scoring cannot publish a score for the old note set', async () => {
  const classifierGate = deferred<void>()
  const service = new NSpamService({
    classifierLoader: async () => {
      await classifierGate.promise
      return { score: (notes) => (notes.length < 5 ? 0.2 : 0.95) }
    }
  })
  const firstFour = [1, 2, 3, 4].map((index) => reply(index))
  service.ingestEvents(firstFour)

  const staleScoring = service.scoreAuthor('author', personalization)
  service.ingestEvents([reply(5)])
  classifierGate.resolve()

  assert.equal(await staleScoring, undefined)
  assert.equal(service.cachedScore('author', personalization.signature), undefined)
  assert.equal(await service.scoreAuthor('author', personalization), 0.95)
  assert.equal(service.cachedScore('author', personalization.signature), 0.95)
})

test('concurrent consumers share scoring and one abort cannot cancel the other', async () => {
  const classifierGate = deferred<void>()
  let classifierLoads = 0
  const service = new NSpamService({
    classifierLoader: async () => {
      classifierLoads += 1
      await classifierGate.promise
      return { score: () => 0.9 }
    }
  })
  service.ingestEvents([reply(1)])
  const firstController = new AbortController()
  const first = service.scoreAuthor('author', personalization, firstController.signal)
  const second = service.scoreAuthor('author', personalization)

  firstController.abort()
  classifierGate.resolve()

  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(await second, 0.9)
  assert.equal(classifierLoads, 1)
  assert.equal(service.cachedScore('author', personalization.signature), 0.9)
})

test('an aborted model load cannot publish an author score', async () => {
  let resolveClassifier: (() => void) | undefined
  const classifierGate = new Promise<void>((resolve) => {
    resolveClassifier = resolve
  })
  const service = new NSpamService({
    classifierLoader: async () => {
      await classifierGate
      return { score: () => 0.1 }
    }
  })
  service.ingestEvents([reply(1)])
  const controller = new AbortController()
  const scoring = service.scoreAuthor('author', personalization, controller.signal)

  controller.abort()
  resolveClassifier?.()
  await assert.rejects(scoring, { name: 'AbortError' })
  assert.equal(service.cachedScore('author', personalization.signature), undefined)
})

test('a model load failure leaves pending replies unscored and hidden', async () => {
  const service = new NSpamService({
    classifierLoader: async () => {
      throw new Error('model unavailable')
    }
  })
  const event = reply(1)
  service.ingestEvents([event])

  await assert.rejects(service.scoreAuthor('author', personalization), /model unavailable/)
  const partition = partitionReplySpam([event], {
    enabled: true,
    signature: personalization.signature,
    cachedScore: (pubkey, signature) => service.cachedScore(pubkey, signature)
  })

  assert.deepEqual(partition.visible, [])
  assert.deepEqual(partition.hidden, [])
  assert.deepEqual(partition.pending, [event])
  assert.deepEqual(partition.pendingPubkeys, ['author'])
})

test('author notes and personalized score entries are bounded', async () => {
  const service = new NSpamService({
    classifierLoader: async () => ({ score: () => 0.4 }),
    maxAuthors: 1,
    maxScoreEntries: 1
  })
  service.ingestEvents([reply(1, 'first')])
  await service.scoreAuthor('first', personalization)
  service.ingestEvents([reply(2, 'second')])
  await service.scoreAuthor('second', personalization)

  assert.equal(service.noteCount('first'), 0)
  assert.equal(service.noteCount('second'), 1)
  assert.equal(service.cachedScore('first', personalization.signature), undefined)
  assert.equal(service.cachedScore('second', personalization.signature), 0.4)
})

test('evicting and reinserting an author cannot publish an obsolete in-flight score', async () => {
  const classifierGate = deferred<void>()
  const service = new NSpamService({
    classifierLoader: async () => {
      await classifierGate.promise
      return {
        score: (notes) => (notes.some((note) => note.content === 'reply 1') ? 0.1 : 0.95)
      }
    },
    maxAuthors: 1
  })
  service.ingestEvents([reply(1, 'author')])

  const obsoleteScoring = service.scoreAuthor('author', personalization)
  service.ingestEvents([reply(2, 'other')])
  service.ingestEvents([reply(3, 'author')])
  classifierGate.resolve()

  assert.equal(await obsoleteScoring, undefined)
  assert.equal(service.cachedScore('author', personalization.signature), undefined)
  assert.equal(await service.scoreAuthor('author', personalization), 0.95)
  assert.equal(service.cachedScore('author', personalization.signature), 0.95)
})
