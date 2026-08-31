import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  adjustNSpamScore,
  extractNSpamFeatures,
  extractNSpamHashFeatures,
  isNSpamScore,
  murmurHash3,
  NSpamAuthorScorer,
  NSpamClassifier,
  NSPAM_FEATURE_COUNTS,
  NSPAM_MODEL_VERSION,
  NSPAM_THRESHOLD,
  parseNSpamLightGBMModel,
  parseNpyFloat32,
  preprocessNSpamText,
  type NSpamNoteInput,
  type NSpamScoringModel,
  type NSpamLightGBMModel,
  type NSpamModelConfig
} from './nspam.ts'

function asset(name: string): Uint8Array {
  return readFileSync(new URL(`../../public/nspam/${name}`, import.meta.url))
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function realModel(): NSpamLightGBMModel {
  const config = JSON.parse(asset('config.json').toString()) as NSpamModelConfig
  return {
    config,
    trees: parseNSpamLightGBMModel(asset('model.txt').toString(), config),
    calibX: parseNpyFloat32(asset('calib_x.npy')).values,
    calibY: parseNpyFloat32(asset('calib_y.npy')).values
  }
}

let realClassifier: NSpamClassifier | undefined

function classifier() {
  realClassifier ??= new NSpamClassifier(realModel())
  return realClassifier
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

test('pinned LightGBM assets have the expected version, hash, and calibration shape', () => {
  const configBytes = asset('config.json')
  const config = JSON.parse(configBytes.toString()) as NSpamModelConfig
  const modelText = asset('model.txt')
  const calibX = parseNpyFloat32(asset('calib_x.npy'))
  const calibY = parseNpyFloat32(asset('calib_y.npy'))

  assert.equal(config.model_version, NSPAM_MODEL_VERSION)
  assert.equal(config.model_type, 'lightgbm')
  assert.equal(
    createHash('sha256').update(configBytes).digest('hex'),
    '4c1d0412748e63f105892a4301bbf7979f8a864756582b1af2426b566edbb847'
  )
  assert.equal(
    createHash('sha256').update(modelText).digest('hex'),
    '0c6e63604b78a668b8bd282d5bc5ad07e54331dd27a6c3f5c06113b8b2c84960'
  )
  assert.equal(
    createHash('sha256').update(asset('calib_x.npy')).digest('hex'),
    'a914043ed129952a904e8d2f647322d20bb5b4cd381a620d646b601b4562c1d6'
  )
  assert.equal(
    createHash('sha256').update(asset('calib_y.npy')).digest('hex'),
    '668bba20635dddd64f643ff17db416acc7af5d457dac21a83b3b35993c717224'
  )
  assert.equal(parseNSpamLightGBMModel(modelText.toString(), config).length, 500)
  assert.deepEqual(calibX.shape, [4])
  assert.deepEqual(calibY.shape, [4])
})

test('classifier rejects stale or modified calibration assets', () => {
  const model = realModel()
  assert.throws(
    () =>
      new NSpamClassifier({
        ...model,
        calibX: new Float32Array(6),
        calibY: new Float32Array(6)
      }),
    /Unsupported NSpam LightGBM model/u
  )

  const modifiedCalibX = new Float32Array(model.calibX)
  modifiedCalibX[1] = 0.5
  assert.throws(
    () => new NSpamClassifier({ ...model, calibX: modifiedCalibX }),
    /Unsupported NSpam LightGBM model/u
  )
})

test('preprocessing and MurmurHash3 match the native feature contract', () => {
  const prepared = preprocessNSpamText(' ＨＥＬＬＯ\u200b  HTTPS://Example.COM/path?q=1 ')

  assert.equal(prepared.rawText, ' HELLO\u200b  HTTPS://Example.COM/path?q=1 ')
  assert.equal(prepared.text, 'hello http://example.com')
  assert.equal(preprocessNSpamText('Straße ΟΣ Ꭰ ꭰ ᲀ').text, 'strasse οσ Ꭰ Ꭰ в')
  assert.equal(
    preprocessNSpamText('\u{1C89} \u{A7CB} \u{10D50} \u{10D65}').text,
    '\u{1C8A} \u{264} \u{10D70} \u{10D85}'
  )
  assert.equal(murmurHash3('foo'), -156_908_512)
})

test('real model scores are finite and stay in the probability range', () => {
  const model = classifier()
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
    const score = model.score(notes)
    assert.notEqual(score, null)
    assert.equal(Number.isFinite(score), true)
    assert.equal(score! >= 0 && score! <= 1, true)
  }
  assert.equal(NSPAM_THRESHOLD, 0.85)
  assert.equal(isNSpamScore(0.849_999), false)
  assert.equal(isNSpamScore(0.85), true)
})

test('all upstream v2.4 hash fixtures match the feature contract', () => {
  const fixtures = fixture('nspam-v2.4-hash-fixtures.jsonl')
    .trim()
    .split(/\r?\n/u)
    .map(
      (line) =>
        JSON.parse(line) as {
          token: string
          word_buckets: { index: number; value: number }[]
          char_wb_buckets: { index: number; value: number }[]
        }
    )

  for (const item of fixtures) {
    const features = extractNSpamHashFeatures(item.token)
    const buckets = (offset: number, count: number) =>
      Array.from(features.slice(offset, offset + count).entries())
        .filter(([, value]) => value !== 0)
        .map(([index, value]) => ({ index, value }))
    const assertFixtureBuckets = (
      actual: { index: number; value: number }[],
      expected: { index: number; value: number }[]
    ) => assert.deepEqual(expected.length === 32 ? actual.slice(0, 32) : actual, expected)

    assertFixtureBuckets(
      buckets(NSPAM_FEATURE_COUNTS.char, NSPAM_FEATURE_COUNTS.word),
      item.word_buckets
    )
    assertFixtureBuckets(buckets(0, NSPAM_FEATURE_COUNTS.char), item.char_wb_buckets)
  }
})

test('all upstream v2.4 parity fixtures score within model tolerance', () => {
  const fixtures = fixture('nspam-v2.4-parity-fixtures.jsonl')
    .trim()
    .split(/\r?\n/u)
    .map(
      (line) =>
        JSON.parse(line) as {
          notes: { content: string; tags: string[][]; created_at: number }[]
          expected_raw_score: number
          expected_calibrated_score: number
        }
    )
  const model = classifier()

  for (const item of fixtures) {
    const notes = item.notes.map(({ content, tags, created_at }) => ({
      content,
      tags,
      createdAt: created_at
    }))
    const rawScore = model.rawScore(notes)
    const calibrated = model.score(notes)

    assert.notEqual(rawScore, null)
    assert.notEqual(calibrated, null)
    assert.ok(Math.abs(rawScore! - item.expected_raw_score) <= 1e-6)
    assert.ok(Math.abs(calibrated! - item.expected_calibrated_score) <= 1e-6)
  }
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
