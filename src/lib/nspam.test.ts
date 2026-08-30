import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  adjustNSpamScore,
  isNSpamScore,
  murmurHash3,
  NSpamAuthorScorer,
  NSpamClassifier,
  NSPAM_FEATURE_COUNTS,
  NSPAM_THRESHOLD,
  parseNpyFloat32,
  preprocessNSpamText,
  type NSpamNoteInput,
  type NSpamScoringModel,
  type NSpamWeights
} from './nspam.ts'

function asset(name: string): Uint8Array {
  return readFileSync(new URL(`../../public/nspam/${name}`, import.meta.url))
}

function realWeights(): NSpamWeights {
  return {
    coef: parseNpyFloat32(asset('effective_coef.npy')).values,
    intercept: parseNpyFloat32(asset('intercept.npy')).values[0],
    calibX: parseNpyFloat32(asset('calib_x.npy')).values,
    calibY: parseNpyFloat32(asset('calib_y.npy')).values
  }
}

function note(content: string, createdAt = 1): NSpamNoteInput {
  return { content, createdAt, tags: [] }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

function contentModel(scores: Record<string, number>): NSpamScoringModel {
  return {
    score(notes) {
      return scores[notes[0]?.content ?? ''] ?? 0.5
    }
  }
}

test('NPY model assets have the expected shapes and coefficient count', () => {
  const coef = parseNpyFloat32(asset('effective_coef.npy'))
  const intercept = parseNpyFloat32(asset('intercept.npy'))
  const calibX = parseNpyFloat32(asset('calib_x.npy'))
  const calibY = parseNpyFloat32(asset('calib_y.npy'))

  assert.deepEqual(coef.shape, [NSPAM_FEATURE_COUNTS.total])
  assert.equal(coef.values.length, 262_167)
  assert.deepEqual(intercept.shape, [])
  assert.equal(intercept.values.length, 1)
  assert.deepEqual(calibX.shape, [6])
  assert.deepEqual(calibY.shape, [6])
})

test('preprocessing and MurmurHash3 match the native feature contract', () => {
  const prepared = preprocessNSpamText(' ＨＥＬＬＯ\u200b  HTTPS://Example.COM/path?q=1 ')

  assert.equal(prepared.rawText, ' HELLO\u200b  HTTPS://Example.COM/path?q=1 ')
  assert.equal(prepared.text, 'hello http://example.com')
  assert.equal(murmurHash3('foo'), -156_908_512)
})

test('real model scores are finite and stay in the probability range', () => {
  const classifier = new NSpamClassifier(realWeights())
  const samples: NSpamNoteInput[][] = [
    [note('Hello Nostr, this is a normal conversation.')],
    [
      note('FREE tokens now!!! https://EXAMPLE.com/a', 100),
      note('FREE tokens now!!! https://example.com/b', 101),
      note('FREE tokens now!!! https://example.com/c', 102)
    ],
    [note('こんにちは 🌸 #nostr', 200)]
  ]

  for (const notes of samples) {
    const score = classifier.score(notes)
    assert.notEqual(score, null)
    assert.equal(Number.isFinite(score), true)
    assert.equal(score! >= 0 && score! <= 1, true)
  }
  assert.equal(NSPAM_THRESHOLD, 0.85)
  assert.equal(isNSpamScore(0.849_999), false)
  assert.equal(isNSpamScore(0.85), true)
})

test('cache invalidates when available notes cross from fewer than five to five', async () => {
  let notes = [note('candidate')]
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({ candidate: 0.42 }),
    noteProvider: () => notes
  })

  assert.equal(await scorer.scoreAuthor({ pubkey: 'Alice' }), 0.42)
  notes = [1, 2, 3, 4].map((createdAt) => note(`note ${createdAt}`, createdAt))
  assert.equal(await scorer.cachedScore({ pubkey: ' alice ' }), 0.42)
  notes = [1, 2, 3, 4, 5].map((createdAt) => note(`note ${createdAt}`, createdAt))
  assert.equal(await scorer.cachedScore({ pubkey: 'ALICE' }), null)
})

test('cache entries are isolated by personalization signature', async () => {
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({ candidate: 0.31 }),
    noteProvider: (pubkey) => (pubkey === 'alice' ? [note('candidate')] : [])
  })

  assert.equal(await scorer.scoreAuthor({ pubkey: 'alice' }), 0.31)
  assert.equal(
    await scorer.cachedScore({ pubkey: 'alice', markedSpamPubkeys: ['labeled-spammer'] }),
    null
  )
  assert.equal(await scorer.cachedScore({ pubkey: 'alice' }), 0.31)
})

test('exact labels are normalized and not-spam takes precedence', async () => {
  let providerCalls = 0
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({}),
    noteProvider: () => {
      providerCalls += 1
      return []
    }
  })

  assert.equal(await scorer.scoreAuthor({ pubkey: ' ALICE ', markedSpamPubkeys: ['alice'] }), 1)
  assert.equal(
    await scorer.scoreAuthor({
      pubkey: 'Alice',
      markedSpamPubkeys: ['ALICE'],
      notSpamPubkeys: [' alice ']
    }),
    0
  )
  assert.equal(providerCalls, 0)
})

test('personalization applies the native similarity threshold and adjustment', () => {
  const candidate = [note('same text and #topic')]

  assert.ok(Math.abs(adjustNSpamScore(0.5, candidate, [candidate], []) - 0.626) < 1e-6)
  assert.ok(Math.abs(adjustNSpamScore(0.5, candidate, [], [candidate]) - 0.374) < 1e-6)
})

test('an older scoring revision cannot overwrite a newer result', async () => {
  const firstNotes = deferred<readonly NSpamNoteInput[]>()
  let providerCall = 0
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({ old: 0.12, new: 0.91 }),
    noteProvider: () => {
      providerCall += 1
      return providerCall === 1 ? firstNotes.promise : [note('new', 2)]
    }
  })

  const oldRevision = scorer.scoreAuthor({ pubkey: 'alice' })
  assert.equal(await scorer.scoreAuthor({ pubkey: 'alice' }), 0.91)
  firstNotes.resolve([note('old', 1)])

  assert.equal(await oldRevision, null)
  assert.equal(await scorer.cachedScore({ pubkey: 'alice' }), 0.91)
})

test('aborting scoring rejects and does not publish its result', async () => {
  const pendingNotes = deferred<readonly NSpamNoteInput[]>()
  const controller = new AbortController()
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({ candidate: 0.7 }),
    noteProvider: () => pendingNotes.promise
  })

  const scoring = scorer.scoreAuthor({ pubkey: 'alice', signal: controller.signal })
  controller.abort()

  await assert.rejects(scoring, (error: unknown) => (error as Error).name === 'AbortError')
})

test('canceling an old revision cannot remove a newer cached entry', async () => {
  const firstNotes = deferred<readonly NSpamNoteInput[]>()
  const oldController = new AbortController()
  let providerCall = 0
  const scorer = new NSpamAuthorScorer({
    classifier: contentModel({ old: 0.15, new: 0.88 }),
    noteProvider: () => {
      providerCall += 1
      return providerCall === 1 ? firstNotes.promise : [note('new', 2)]
    }
  })

  const oldRevision = scorer.scoreAuthor({ pubkey: 'alice', signal: oldController.signal })
  assert.equal(await scorer.scoreAuthor({ pubkey: 'alice' }), 0.88)
  oldController.abort()

  await assert.rejects(oldRevision, (error: unknown) => (error as Error).name === 'AbortError')
  assert.equal(await scorer.cachedScore({ pubkey: 'alice' }), 0.88)
})
