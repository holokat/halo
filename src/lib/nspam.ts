import { unicodeCasefold } from './unicode-casefold'

export interface NSpamNoteInput {
  content: string
  tags: readonly (readonly string[])[]
  createdAt: number
}

export interface NSpamPersonalization {
  markedSpamPubkeys?: readonly string[]
  notSpamPubkeys?: readonly string[]
}

export interface NSpamScoreRequest extends NSpamPersonalization {
  pubkey: string
  seedNotes?: readonly NSpamNoteInput[]
  signal?: AbortSignal
}

export interface NSpamCachedScoreRequest extends NSpamPersonalization {
  pubkey: string
  signal?: AbortSignal
}

export type NSpamNoteProvider = (
  pubkey: string,
  signal?: AbortSignal
) => Promise<readonly NSpamNoteInput[]> | readonly NSpamNoteInput[]

export interface NSpamScoringModel {
  score(notes: readonly NSpamNoteInput[]): number | null
}

export interface NSpamAuthorScorerOptions {
  classifier: NSpamScoringModel
  noteProvider?: NSpamNoteProvider
  maxCacheEntries?: number
}

export interface NSpamModelLoadOptions {
  baseUrl?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export interface NSpamModelConfig {
  schema_version: number
  model_version: string
  model_type: string
  n_features_char: number
  n_features_word: number
  char_ngram_range: readonly number[]
  word_ngram_range: readonly number[]
  word_analyzer: string
  char_analyzer: string
  structural_names: readonly string[]
  group_feature_names: readonly string[]
  unicode_normalization: string
  casefold: boolean
  hashing: {
    algorithm: string
    alternate_sign: boolean
  }
}

export interface NSpamLightGBMTree {
  splitFeature: Int32Array
  threshold: Float64Array
  decisionType: Uint8Array
  leftChild: Int32Array
  rightChild: Int32Array
  leafValue: Float64Array
}

export interface NSpamLightGBMModel {
  config: NSpamModelConfig
  trees: readonly NSpamLightGBMTree[]
  calibX: Float32Array
  calibY: Float32Array
}

export interface NpyFloat32 {
  values: Float32Array
  shape: readonly number[]
}

export const NSPAM_THRESHOLD = 0.85
export const NSPAM_MAX_NOTES = 10
export const NSPAM_MODEL_VERSION = 'v2.4'

export const NSPAM_FEATURE_COUNTS = Object.freeze({
  char: 131_072,
  word: 131_072,
  structural: 17,
  group: 6,
  total: 262_167
})

export const NSPAM_MODEL_FILES = Object.freeze({
  config: 'config.json',
  model: 'model.txt',
  calibX: 'calib_x.npy',
  calibY: 'calib_y.npy'
})

const NSPAM_CALIBRATION_X = new Float32Array([
  2.738_783_866_362_837_2e-9, 0.000_733_944_063_540_548_1, 0.089_570_365_846_157_07,
  0.999_999_940_395_355_2
])
const NSPAM_CALIBRATION_Y = new Float32Array([0, 0, 1, 1])

const INVISIBLE_CHARACTERS = /[\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu
const URL_WITH_OPTIONAL_PATH = /https?:\/\/([^\s/]+)(\/\S*)?/giu
const URL_HOST = /https?:\/\/([^\s/]+)/giu
const WORD = /[\p{L}\p{N}_]{2,}/gu
const MENTION = /\b(?:nostr:)?(?:npub1|note1|nprofile1|nevent1|naddr1)[0-9a-z]+/giu
const HASHTAG = /#[\p{L}\p{M}\p{N}_]+/gu
const NON_WHITESPACE_TOKEN = /\S+/gu
const DIGIT = /\p{N}/gu
const PUNCTUATION = /\p{P}/gu
const EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu
const LETTER = /\p{L}/u
const TOKEN = /\p{L}[\p{L}\p{M}\p{N}_]*|\p{N}+|https?:\/\/\S+|[#@][\p{L}\p{M}\p{N}_]+/gu

const encoder = new TextEncoder()

interface PreparedText {
  text: string
  rawText: string
}

interface NormalizedLabels {
  markedSpamPubkeys: string[]
  notSpamPubkeys: string[]
  signature: string
  exactScore(pubkey: string): number | null
}

interface CacheEntry {
  score: number
  noteCount: number
  scoringRevision: number
}

function normalizePubkey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizedUnique(pubkeys: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const pubkey of pubkeys) {
    const normalized = normalizePubkey(pubkey)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }

  return result
}

function normalizeLabels(personalization: NSpamPersonalization): NormalizedLabels {
  const notSpamPubkeys = normalizedUnique(personalization.notSpamPubkeys ?? [])
  const notSpamSet = new Set(notSpamPubkeys)
  const markedSpamPubkeys = normalizedUnique(personalization.markedSpamPubkeys ?? []).filter(
    (pubkey) => !notSpamSet.has(pubkey)
  )

  return {
    markedSpamPubkeys,
    notSpamPubkeys,
    signature: `${markedSpamPubkeys.join('|')}-${notSpamPubkeys.join('|')}`,
    exactScore(pubkey: string): number | null {
      const normalized = normalizePubkey(pubkey)
      if (notSpamPubkeys.includes(normalized)) return 0
      if (markedSpamPubkeys.includes(normalized)) return 1
      return null
    }
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}

function matchedStrings(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0])
}

function removeInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE_CHARACTERS, '')
}

function prefixCharacters(text: string, limit: number): string {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: 'grapheme' }
      ) => { segment(value: string): Iterable<{ segment: string }> }
    }
  ).Segmenter

  if (Segmenter) {
    const segments = new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)
    let result = ''
    let count = 0
    for (const item of segments) {
      if (count >= limit) break
      result += item.segment
      count += 1
    }
    return result
  }

  return Array.from(text).slice(0, limit).join('')
}

export function preprocessNSpamText(text: string): PreparedText {
  const rawText = text.normalize('NFKC')
  const normalized = removeInvisibleCharacters(rawText).replace(
    URL_WITH_OPTIONAL_PATH,
    (_match, host: string) => `http://${host.toLowerCase()}`
  )
  const casefolded = unicodeCasefold(normalized)
  const preparedText = casefolded.replace(/\s+/gu, ' ').trim()

  return { text: preparedText, rawText }
}

export function murmurHash3(value: string | Uint8Array, seed = 0): number {
  const data = typeof value === 'string' ? encoder.encode(value) : value
  let h1 = seed | 0
  const blockCount = Math.floor(data.length / 4)

  for (let block = 0; block < blockCount; block += 1) {
    const offset = block * 4
    let k1 =
      (data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)

    k1 = Math.imul(k1, 0xcc9e2d51)
    k1 = (k1 << 15) | (k1 >>> 17)
    k1 = Math.imul(k1, 0x1b873593)

    h1 ^= k1
    h1 = (h1 << 13) | (h1 >>> 19)
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0
  }

  const tailOffset = blockCount * 4
  let k1 = 0
  switch (data.length & 3) {
    case 3:
      k1 ^= (data[tailOffset + 2] ?? 0) << 16
      k1 ^= (data[tailOffset + 1] ?? 0) << 8
      k1 ^= data[tailOffset] ?? 0
      break
    case 2:
      k1 ^= (data[tailOffset + 1] ?? 0) << 8
      k1 ^= data[tailOffset] ?? 0
      break
    case 1:
      k1 ^= data[tailOffset] ?? 0
      break
  }

  if ((data.length & 3) !== 0) {
    k1 = Math.imul(k1, 0xcc9e2d51)
    k1 = (k1 << 15) | (k1 >>> 17)
    k1 = Math.imul(k1, 0x1b873593)
    h1 ^= k1
  }

  h1 ^= data.length
  h1 ^= h1 >>> 16
  h1 = Math.imul(h1, 0x85ebca6b)
  h1 ^= h1 >>> 13
  h1 = Math.imul(h1, 0xc2b2ae35)
  h1 ^= h1 >>> 16
  return h1 | 0
}

function hashInto(
  features: Float32Array,
  token: string,
  offset: number,
  featureCount: number
): void {
  const hash = murmurHash3(token)
  const index = Math.abs(hash) % featureCount
  features[offset + index] += hash >= 0 ? 1 : -1
}

function hashCharWbNgrams(text: string, features: Float32Array): void {
  const normalized = text.replace(/\s+/gu, ' ')
  for (const word of normalized.split(' ').filter(Boolean)) {
    const padded = Array.from(` ${word} `)
    for (let length = 3; length <= 5; length += 1) {
      if (padded.length < length) continue
      for (let start = 0; start <= padded.length - length; start += 1) {
        hashInto(
          features,
          padded.slice(start, start + length).join(''),
          0,
          NSPAM_FEATURE_COUNTS.char
        )
      }
    }
  }
}

function hashWordNgrams(text: string, features: Float32Array): void {
  const tokens = matchedStrings(text, WORD)
  for (const token of tokens) {
    hashInto(features, token, NSPAM_FEATURE_COUNTS.char, NSPAM_FEATURE_COUNTS.word)
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    hashInto(
      features,
      `${tokens[index]} ${tokens[index + 1]}`,
      NSPAM_FEATURE_COUNTS.char,
      NSPAM_FEATURE_COUNTS.word
    )
  }
}

function structuralFeatures(note: NSpamNoteInput): number[] {
  const raw = note.content
  const urlMatches = [...raw.matchAll(URL_HOST)]
  const urlDomains = urlMatches.map((match) => (match[1] ?? '').toLowerCase())
  let tagP = 0
  let tagE = 0
  let tagT = 0
  let tagOther = 0

  for (const tag of note.tags) {
    switch (tag[0]) {
      case 'p':
        tagP += 1
        break
      case 'e':
        tagE += 1
        break
      case 't':
        tagT += 1
        break
      case undefined:
        break
      default:
        tagOther += 1
    }
  }

  // Python's source pipeline counts Unicode code points. JS string length is
  // UTF-16 code units, which would inflate every non-BMP character.
  const length = Array.from(raw).length
  const emojiCount = countMatches(raw, EMOJI)
  const alphaCharacters = Array.from(raw).filter((character) => LETTER.test(character))
  const capsCount = alphaCharacters.filter(
    (character) => character.toUpperCase() === character && character.toLowerCase() !== character
  ).length
  const digitCount = countMatches(raw, DIGIT)
  const punctuationCount = countMatches(raw, PUNCTUATION)

  return [
    length,
    countMatches(raw, NON_WHITESPACE_TOKEN),
    urlMatches.length,
    new Set(urlDomains).size,
    countMatches(raw, MENTION),
    countMatches(raw, HASHTAG),
    tagP,
    tagE,
    tagT,
    tagOther,
    emojiCount,
    length > 0 ? emojiCount / length : 0,
    countMatches(raw, INVISIBLE_CHARACTERS),
    alphaCharacters.length > 0 ? capsCount / alphaCharacters.length : 0,
    length > 0 ? digitCount / length : 0,
    length > 0 ? punctuationCount / length : 0,
    0
  ]
}

function populationStdDev(values: readonly number[]): number {
  if (values.length <= 1) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean
      return sum + delta * delta
    }, 0) / values.length
  return Math.sqrt(variance)
}

function tokenizedLowercase(text: string): string[] {
  return matchedStrings(text.toLowerCase(), TOKEN)
}

export function extractNSpamFeatures(notes: readonly NSpamNoteInput[]): Float32Array {
  const features = new Float32Array(NSPAM_FEATURE_COUNTS.total)
  if (notes.length === 0) return features

  const prepared = notes.map((note) => preprocessNSpamText(note.content))
  hashCharWbNgrams(prepared.map((item) => item.rawText).join(' '), features)
  hashWordNgrams(prepared.map((item) => item.text).join(' '), features)

  const structuralSums = new Float32Array(NSPAM_FEATURE_COUNTS.structural)
  const charLengths: number[] = []
  const bodyKeys: string[] = []
  const rawTexts: string[] = []

  for (const note of notes) {
    const raw = note.content
    rawTexts.push(raw)
    bodyKeys.push(prefixCharacters(removeInvisibleCharacters(raw).trim().toLowerCase(), 200))
    const structural = structuralFeatures(note)
    for (let index = 0; index < structural.length; index += 1) {
      structuralSums[index] += structural[index]
    }
    charLengths.push(Array.from(raw).length)
  }

  const structuralOffset = NSPAM_FEATURE_COUNTS.char + NSPAM_FEATURE_COUNTS.word
  for (let index = 0; index < NSPAM_FEATURE_COUNTS.structural; index += 1) {
    features[structuralOffset + index] = structuralSums[index] / notes.length
  }

  const groupOffset = structuralOffset + NSPAM_FEATURE_COUNTS.structural
  features[groupOffset] = notes.length
  if (notes.length > 1) {
    const createdAtValues = notes.map((note) => note.createdAt)
    features[groupOffset + 1] =
      (Math.max(...createdAtValues) - Math.min(...createdAtValues)) / 3_600
  }
  features[groupOffset + 2] = new Set(bodyKeys.filter(Boolean)).size

  if (notes.length >= 2) {
    features[groupOffset + 3] = populationStdDev(charLengths)
    const tokenLists = rawTexts.map(tokenizedLowercase)
    const firstTokens = tokenLists.flatMap((tokens) => (tokens[0] ? [tokens[0]] : []))

    if (firstTokens.length > 0) {
      const firstTokenCounts = new Map<string, number>()
      for (const token of firstTokens) {
        firstTokenCounts.set(token, (firstTokenCounts.get(token) ?? 0) + 1)
      }
      features[groupOffset + 4] = Math.max(...firstTokenCounts.values()) / notes.length
    }

    const tokenSets = tokenLists.map((tokens) => new Set(tokens))
    let jaccardSum = 0
    let jaccardCount = 0
    for (let lhsIndex = 0; lhsIndex < tokenSets.length; lhsIndex += 1) {
      for (let rhsIndex = lhsIndex + 1; rhsIndex < tokenSets.length; rhsIndex += 1) {
        const lhs = tokenSets[lhsIndex]
        const rhs = tokenSets[rhsIndex]
        const union = new Set([...lhs, ...rhs])
        if (union.size > 0) {
          let intersectionCount = 0
          for (const token of lhs) {
            if (rhs.has(token)) intersectionCount += 1
          }
          jaccardSum += intersectionCount / union.size
        }
        jaccardCount += 1
      }
    }

    if (jaccardCount > 0) {
      features[groupOffset + 5] = jaccardSum / jaccardCount
    }
  }

  return features
}

/** Exposes the raw hashing contract used by the upstream hash fixtures. */
export function extractNSpamHashFeatures(text: string): Float32Array {
  const features = new Float32Array(NSPAM_FEATURE_COUNTS.total)
  hashCharWbNgrams(text, features)
  hashWordNgrams(text, features)
  return features
}

function product(values: readonly number[]): number {
  return values.length === 0 ? 1 : values.reduce((result, value) => result * value, 1)
}

export function parseNpyFloat32(source: ArrayBuffer | Uint8Array): NpyFloat32 {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source)
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x93 ||
    bytes[1] !== 0x4e ||
    bytes[2] !== 0x55 ||
    bytes[3] !== 0x4d ||
    bytes[4] !== 0x50 ||
    bytes[5] !== 0x59
  ) {
    throw new Error('Invalid NPY file')
  }

  const major = bytes[6]
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerStart = major <= 1 ? 10 : 12
  if (bytes.length < headerStart) throw new Error('Invalid NPY header')
  const headerLength = major <= 1 ? view.getUint16(8, true) : view.getUint32(8, true)
  const dataStart = headerStart + headerLength
  if (dataStart > bytes.length) throw new Error('Invalid NPY header length')

  const header = new TextDecoder('ascii').decode(bytes.subarray(headerStart, dataStart))
  const descriptor = header.match(/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]
  if (descriptor !== '<f4' && descriptor !== '=f4') {
    throw new Error(`Unsupported NPY dtype: ${descriptor ?? 'unknown'}`)
  }

  const shapeBody = header.match(/['"]shape['"]\s*:\s*\(([^)]*)\)/)?.[1]
  if (shapeBody === undefined) throw new Error('Invalid NPY shape')
  const shape = shapeBody
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
  if (shape.some((dimension) => !Number.isSafeInteger(dimension) || dimension < 0)) {
    throw new Error('Invalid NPY shape')
  }

  const count = product(shape)
  if (dataStart + count * 4 > bytes.length) throw new Error('Truncated NPY data')
  const values = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    values[index] = view.getFloat32(dataStart + index * 4, true)
  }

  return { values, shape }
}

function joinModelUrl(baseUrl: string, fileName: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/${fileName}`
}

function parseNumberList(value: string | undefined, field: string): number[] {
  if (value === undefined) throw new Error(`Missing LightGBM ${field}`)
  const values = value.trim().split(/\s+/u).filter(Boolean).map(Number)
  if (values.some((item) => !Number.isFinite(item))) {
    throw new Error(`Invalid LightGBM ${field}`)
  }
  return values
}

function parseIntegerList(value: string | undefined, field: string): Int32Array {
  const values = parseNumberList(value, field)
  if (values.some((item) => !Number.isSafeInteger(item))) {
    throw new Error(`Invalid LightGBM integer ${field}`)
  }
  return Int32Array.from(values)
}

function parseLightGBMTree(fields: ReadonlyMap<string, string>): NSpamLightGBMTree {
  const leafValue = Float64Array.from(parseNumberList(fields.get('leaf_value'), 'leaf_value'))
  const splitFeature = parseIntegerList(fields.get('split_feature'), 'split_feature')
  const threshold = Float64Array.from(parseNumberList(fields.get('threshold'), 'threshold'))
  const decisionType = Uint8Array.from(
    parseNumberList(fields.get('decision_type'), 'decision_type')
  )
  const leftChild = parseIntegerList(fields.get('left_child'), 'left_child')
  const rightChild = parseIntegerList(fields.get('right_child'), 'right_child')
  const internalNodeCount = splitFeature.length

  if (
    leafValue.length === 0 ||
    threshold.length !== internalNodeCount ||
    decisionType.length !== internalNodeCount ||
    leftChild.length !== internalNodeCount ||
    rightChild.length !== internalNodeCount
  ) {
    throw new Error('Invalid LightGBM tree shape')
  }

  if (Array.from(decisionType).some((decision) => decision !== 2)) {
    throw new Error('Unsupported LightGBM decision type')
  }

  return { splitFeature, threshold, decisionType, leftChild, rightChild, leafValue }
}

/** Parses the numerical-split subset used by the pinned NSpam v2.4 LightGBM model. */
export function parseNSpamLightGBMModel(
  source: string,
  config: NSpamModelConfig
): readonly NSpamLightGBMTree[] {
  const expectedFeatureCount =
    config.n_features_char +
    config.n_features_word +
    config.structural_names.length +
    config.group_feature_names.length
  if (
    config.model_version !== NSPAM_MODEL_VERSION ||
    config.model_type !== 'lightgbm' ||
    config.n_features_char !== NSPAM_FEATURE_COUNTS.char ||
    config.n_features_word !== NSPAM_FEATURE_COUNTS.word ||
    expectedFeatureCount !== NSPAM_FEATURE_COUNTS.total
  ) {
    throw new Error('Unsupported NSpam model configuration')
  }

  const header = new Map<string, string>()
  const trees: NSpamLightGBMTree[] = []
  let fields: Map<string, string> | undefined

  const finishTree = () => {
    if (!fields) return
    trees.push(parseLightGBMTree(fields))
    fields = undefined
  }

  for (const line of source.split(/\r?\n/u)) {
    if (!line) continue
    if (/^Tree=\d+$/u.test(line)) {
      finishTree()
      fields = new Map()
      continue
    }

    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (fields) {
      fields.set(key, value)
    } else {
      header.set(key, value)
    }
  }
  finishTree()

  const maxFeatureIndex = Number.parseInt(header.get('max_feature_idx') ?? '', 10)
  if (
    maxFeatureIndex + 1 !== expectedFeatureCount ||
    header.get('objective') !== 'binary sigmoid:1'
  ) {
    throw new Error('Unexpected LightGBM model metadata')
  }
  if (trees.length === 0) throw new Error('LightGBM model has no trees')

  for (const tree of trees) {
    if (Array.from(tree.splitFeature).some((index) => index < 0 || index >= expectedFeatureCount)) {
      throw new Error('LightGBM tree references an invalid feature')
    }
  }

  return trees
}

function parseNSpamModelConfig(source: string): NSpamModelConfig {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('Invalid NSpam model configuration JSON')
  }

  if (!value || typeof value !== 'object') throw new Error('Invalid NSpam model configuration')
  const config = value as Partial<NSpamModelConfig>
  if (
    config.schema_version !== 2 ||
    config.model_version !== NSPAM_MODEL_VERSION ||
    config.model_type !== 'lightgbm' ||
    typeof config.n_features_char !== 'number' ||
    !Number.isSafeInteger(config.n_features_char) ||
    typeof config.n_features_word !== 'number' ||
    !Number.isSafeInteger(config.n_features_word) ||
    !Array.isArray(config.char_ngram_range) ||
    config.char_ngram_range.join(',') !== '3,5' ||
    !Array.isArray(config.word_ngram_range) ||
    config.word_ngram_range.join(',') !== '1,2' ||
    config.word_analyzer !== 'word' ||
    config.char_analyzer !== 'char_wb' ||
    !Array.isArray(config.structural_names) ||
    !Array.isArray(config.group_feature_names) ||
    config.unicode_normalization !== 'NFKC' ||
    config.casefold !== true ||
    config.hashing?.algorithm !== 'MurmurHash3 x86 32-bit (seed=0)' ||
    config.hashing.alternate_sign !== true
  ) {
    throw new Error('Unsupported NSpam model configuration')
  }

  return {
    schema_version: config.schema_version,
    model_version: config.model_version,
    model_type: config.model_type,
    n_features_char: config.n_features_char,
    n_features_word: config.n_features_word,
    char_ngram_range: config.char_ngram_range,
    word_ngram_range: config.word_ngram_range,
    word_analyzer: config.word_analyzer,
    char_analyzer: config.char_analyzer,
    structural_names: config.structural_names,
    group_feature_names: config.group_feature_names,
    unicode_normalization: config.unicode_normalization,
    casefold: config.casefold,
    hashing: config.hashing
  }
}

export async function loadNSpamModel(
  options: NSpamModelLoadOptions = {}
): Promise<NSpamLightGBMModel> {
  const baseUrl = options.baseUrl ?? '/nspam'
  const fetcher = options.fetcher ?? globalThis.fetch
  if (!fetcher) throw new Error('Fetch is unavailable')

  const loadNpy = async (fileName: string): Promise<NpyFloat32> => {
    const response = await fetcher(joinModelUrl(baseUrl, fileName), { signal: options.signal })
    if (!response.ok) {
      throw new Error(`Could not load NSpam model asset ${fileName}: ${response.status}`)
    }
    return parseNpyFloat32(await response.arrayBuffer())
  }

  const loadText = async (fileName: string) => {
    const response = await fetcher(joinModelUrl(baseUrl, fileName), { signal: options.signal })
    if (!response.ok) {
      throw new Error(`Could not load NSpam model asset ${fileName}: ${response.status}`)
    }
    return await response.text()
  }

  const [configSource, modelSource, calibX, calibY] = await Promise.all([
    loadText(NSPAM_MODEL_FILES.config),
    loadText(NSPAM_MODEL_FILES.model),
    loadNpy(NSPAM_MODEL_FILES.calibX),
    loadNpy(NSPAM_MODEL_FILES.calibY)
  ])

  if (
    calibX.shape.length !== 1 ||
    calibY.shape.length !== 1 ||
    calibX.shape[0] !== NSPAM_CALIBRATION_X.length ||
    calibY.shape[0] !== NSPAM_CALIBRATION_Y.length ||
    !hasPinnedCalibration(calibX.values, calibY.values)
  ) {
    throw new Error('Unexpected NSpam calibration shape')
  }

  const config = parseNSpamModelConfig(configSource)
  return {
    config,
    trees: parseNSpamLightGBMModel(modelSource, config),
    calibX: calibX.values,
    calibY: calibY.values
  }
}

function calibratedScore(raw: number, calibX: Float32Array, calibY: Float32Array): number {
  if (calibX.length === 0 || calibX.length !== calibY.length) return raw
  if (raw <= calibX[0]) return calibY[0]
  const lastIndex = calibX.length - 1
  if (raw >= calibX[lastIndex]) return calibY[lastIndex]

  for (let index = 0; index < lastIndex; index += 1) {
    if (raw >= calibX[index] && raw < calibX[index + 1]) {
      const denominator = calibX[index + 1] - calibX[index]
      if (denominator === 0) return calibY[index]
      const interpolation = (raw - calibX[index]) / denominator
      return calibY[index] + interpolation * (calibY[index + 1] - calibY[index])
    }
  }

  return calibY[lastIndex]
}

function hasPinnedCalibration(calibX: Float32Array, calibY: Float32Array): boolean {
  return (
    calibX.length === NSPAM_CALIBRATION_X.length &&
    calibY.length === NSPAM_CALIBRATION_Y.length &&
    calibX.every((value, index) => value === NSPAM_CALIBRATION_X[index]) &&
    calibY.every((value, index) => value === NSPAM_CALIBRATION_Y[index])
  )
}

export class NSpamClassifier implements NSpamScoringModel {
  readonly model: NSpamLightGBMModel

  constructor(model: NSpamLightGBMModel) {
    if (
      model.config.model_version !== NSPAM_MODEL_VERSION ||
      model.trees.length === 0 ||
      !hasPinnedCalibration(model.calibX, model.calibY)
    ) {
      throw new Error('Unsupported NSpam LightGBM model')
    }
    this.model = model
  }

  static async load(options: NSpamModelLoadOptions = {}): Promise<NSpamClassifier> {
    return new NSpamClassifier(await loadNSpamModel(options))
  }

  rawScore(notes: readonly NSpamNoteInput[]): number | null {
    if (notes.length === 0) return null
    const cappedNotes =
      notes.length > NSPAM_MAX_NOTES
        ? [...notes].sort((lhs, rhs) => rhs.createdAt - lhs.createdAt).slice(0, NSPAM_MAX_NOTES)
        : notes
    const features = extractNSpamFeatures(cappedNotes)
    let score = 0

    for (const tree of this.model.trees) {
      let node = 0
      while (node >= 0) {
        const featureValue = features[tree.splitFeature[node]]
        const goesLeft = Number.isNaN(featureValue)
          ? (tree.decisionType[node] & 2) !== 0
          : featureValue <= tree.threshold[node]
        node = goesLeft ? tree.leftChild[node] : tree.rightChild[node]
      }
      score += tree.leafValue[-node - 1]
    }

    return score >= 0 ? 1 / (1 + Math.exp(-score)) : Math.exp(score) / (1 + Math.exp(score))
  }

  score(notes: readonly NSpamNoteInput[]): number | null {
    const rawScore = this.rawScore(notes)
    return rawScore === null
      ? null
      : calibratedScore(rawScore, this.model.calibX, this.model.calibY)
  }
}

export function isNSpamScore(score: number, threshold = NSPAM_THRESHOLD): boolean {
  return score >= threshold
}

function cosineSimilarity(lhs: Float32Array, rhs: Float32Array): number {
  const count = Math.min(lhs.length, rhs.length)
  let dot = 0
  let lhsNorm = 0
  let rhsNorm = 0
  for (let index = 0; index < count; index += 1) {
    const lhsValue = lhs[index]
    const rhsValue = rhs[index]
    dot += lhsValue * rhsValue
    lhsNorm += lhsValue * lhsValue
    rhsNorm += rhsValue * rhsValue
  }
  if (lhsNorm <= 0 || rhsNorm <= 0) return 0
  return dot / (Math.sqrt(lhsNorm) * Math.sqrt(rhsNorm))
}

function maxSimilarity(
  candidateFeatures: Float32Array,
  labeledNotes: readonly (readonly NSpamNoteInput[])[]
): number {
  let maximum = 0
  for (const notes of labeledNotes.slice(0, 16)) {
    if (notes.length === 0) continue
    maximum = Math.max(maximum, cosineSimilarity(candidateFeatures, extractNSpamFeatures(notes)))
  }
  return maximum
}

export function adjustNSpamScore(
  baseScore: number,
  candidateNotes: readonly NSpamNoteInput[],
  markedSpamNotes: readonly (readonly NSpamNoteInput[])[],
  notSpamNotes: readonly (readonly NSpamNoteInput[])[]
): number {
  if (candidateNotes.length === 0 || (markedSpamNotes.length === 0 && notSpamNotes.length === 0)) {
    return baseScore
  }

  const candidateFeatures = extractNSpamFeatures(candidateNotes)
  const spamSimilarity = maxSimilarity(candidateFeatures, markedSpamNotes)
  const notSpamSimilarity = maxSimilarity(candidateFeatures, notSpamNotes)
  const spamBoost = Math.max(0, spamSimilarity - 0.55) * 0.28
  const notSpamReduction = Math.max(0, notSpamSimilarity - 0.55) * 0.28
  return Math.min(Math.max(baseScore + spamBoost - notSpamReduction, 0), 1)
}

class NSpamAuthorCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly order: string[] = []

  constructor(private readonly maxEntries: number) {}

  get(pubkey: string, currentNoteCount: number, personalizationSignature: string): number | null {
    const key = this.key(pubkey, personalizationSignature)
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.noteCount < 5 && currentNoteCount >= 5) return null
    this.touch(key)
    return entry.score
  }

  put(
    pubkey: string,
    score: number,
    noteCount: number,
    personalizationSignature: string,
    scoringRevision: number
  ): boolean {
    const key = this.key(pubkey, personalizationSignature)
    const existing = this.entries.get(key)
    if (existing && existing.scoringRevision > scoringRevision) return false
    this.entries.set(key, { score, noteCount, scoringRevision })
    this.touch(key)
    while (this.entries.size > this.maxEntries && this.order.length > 0) {
      const oldest = this.order.shift()
      if (oldest) this.entries.delete(oldest)
    }
    return true
  }

  remove(pubkey: string, personalizationSignature: string, scoringRevision: number): void {
    const key = this.key(pubkey, personalizationSignature)
    if (this.entries.get(key)?.scoringRevision !== scoringRevision) return
    this.entries.delete(key)
    const index = this.order.indexOf(key)
    if (index >= 0) this.order.splice(index, 1)
  }

  private key(pubkey: string, personalizationSignature: string): string {
    return `${pubkey}\u001d${personalizationSignature}`
  }

  private touch(key: string): void {
    const index = this.order.indexOf(key)
    if (index >= 0) this.order.splice(index, 1)
    this.order.push(key)
  }
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal)
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  throwIfAborted(signal)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

function mergedNoteInputs(
  seedNotes: readonly NSpamNoteInput[],
  cachedNotes: readonly NSpamNoteInput[]
): NSpamNoteInput[] {
  const seen = new Set<string>()
  const merged: NSpamNoteInput[] = []
  const sorted = [...seedNotes, ...cachedNotes].sort((lhs, rhs) => rhs.createdAt - lhs.createdAt)

  for (const note of sorted) {
    const key = `${note.createdAt}\u001e${note.content}\u001e${note.tags.flat().join('\u001f')}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(note)
    if (merged.length >= NSPAM_MAX_NOTES) break
  }
  return merged
}

export class NSpamAuthorScorer {
  private readonly classifier: NSpamScoringModel
  private readonly noteProvider: NSpamNoteProvider
  private readonly cache: NSpamAuthorCache
  private scoringRevision = 0

  constructor(options: NSpamAuthorScorerOptions) {
    this.classifier = options.classifier
    this.noteProvider = options.noteProvider ?? (() => [])
    this.cache = new NSpamAuthorCache(options.maxCacheEntries ?? 2_000)
  }

  async cachedScore(request: NSpamCachedScoreRequest): Promise<number | null> {
    throwIfAborted(request.signal)
    const normalized = normalizePubkey(request.pubkey)
    if (!normalized) return null
    const labels = normalizeLabels(request)
    const exactScore = labels.exactScore(normalized)
    if (exactScore !== null) return exactScore
    const notes = await this.notesFor(normalized, request.signal)
    throwIfAborted(request.signal)
    return this.cache.get(normalized, notes.length, labels.signature)
  }

  async scoreAuthor(request: NSpamScoreRequest): Promise<number | null> {
    const normalized = normalizePubkey(request.pubkey)
    if (!normalized) return null
    const labels = normalizeLabels(request)
    const revision = ++this.scoringRevision
    const removeOwnRevision = () => this.cache.remove(normalized, labels.signature, revision)
    request.signal?.addEventListener('abort', removeOwnRevision, { once: true })

    try {
      throwIfAborted(request.signal)
      const exactScore = labels.exactScore(normalized)
      if (exactScore !== null) {
        return this.publishScore(
          normalized,
          exactScore,
          0,
          labels.signature,
          revision,
          request.signal
        )
      }

      const cachedNotes = await this.notesFor(normalized, request.signal)
      throwIfAborted(request.signal)
      const notes = mergedNoteInputs(request.seedNotes ?? [], cachedNotes)
      if (notes.length === 0) {
        return this.publishScore(normalized, 0, 0, labels.signature, revision, request.signal)
      }
      const baseScore = this.classifier.score(notes)
      if (baseScore === null) {
        return this.publishScore(
          normalized,
          0,
          notes.length,
          labels.signature,
          revision,
          request.signal
        )
      }
      const adjustedScore = await this.personalizedScore(
        baseScore,
        normalized,
        notes,
        labels,
        request.signal
      )
      throwIfAborted(request.signal)
      return this.publishScore(
        normalized,
        adjustedScore,
        notes.length,
        labels.signature,
        revision,
        request.signal
      )
    } catch (error) {
      removeOwnRevision()
      if (request.signal?.aborted) throw abortError(request.signal)
      throw error
    } finally {
      request.signal?.removeEventListener('abort', removeOwnRevision)
    }
  }

  private publishScore(
    pubkey: string,
    score: number,
    noteCount: number,
    signature: string,
    revision: number,
    signal?: AbortSignal
  ): number | null {
    throwIfAborted(signal)
    if (!this.cache.put(pubkey, score, noteCount, signature, revision)) return null
    if (signal?.aborted) {
      this.cache.remove(pubkey, signature, revision)
      throw abortError(signal)
    }
    return score
  }

  private async personalizedScore(
    baseScore: number,
    candidatePubkey: string,
    candidateNotes: readonly NSpamNoteInput[],
    labels: NormalizedLabels,
    signal?: AbortSignal
  ): Promise<number> {
    const markedSpamNotes: NSpamNoteInput[][] = []
    for (const pubkey of labels.markedSpamPubkeys.filter((item) => item !== candidatePubkey)) {
      const notes = await this.notesFor(pubkey, signal)
      if (notes.length > 0) markedSpamNotes.push(notes)
    }

    const notSpamNotes: NSpamNoteInput[][] = []
    for (const pubkey of labels.notSpamPubkeys.filter((item) => item !== candidatePubkey)) {
      const notes = await this.notesFor(pubkey, signal)
      if (notes.length > 0) notSpamNotes.push(notes)
    }

    return adjustNSpamScore(baseScore, candidateNotes, markedSpamNotes, notSpamNotes)
  }

  private async notesFor(pubkey: string, signal?: AbortSignal): Promise<NSpamNoteInput[]> {
    const provided = Promise.resolve(this.noteProvider(pubkey, signal))
    const notes = await raceWithAbort(provided, signal)
    throwIfAborted(signal)
    return [...notes].sort((lhs, rhs) => rhs.createdAt - lhs.createdAt).slice(0, NSPAM_MAX_NOTES)
  }
}
