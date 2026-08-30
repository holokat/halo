import {
  NSpamAuthorScorer,
  NSpamClassifier,
  type NSpamNoteInput,
  type NSpamScoringModel
} from '@/lib/nspam'
import { Event } from 'nostr-tools'

const SCORABLE_KINDS = new Set([1, 1111, 1244])
const MAX_NOTES_PER_AUTHOR = 10
const RESCORE_NOTE_THRESHOLD = 5

type TScoreEntry = {
  noteCount: number
  revision: number
  score: number
}

type TInflightScore = {
  consumers: number
  controller: AbortController
  promise: Promise<number | undefined>
  settled: boolean
}

export type TNSpamPersonalization = {
  markedPubkeys: ReadonlySet<string>
  safelistedPubkeys: ReadonlySet<string>
  signature: string
}

type TNSpamServiceOptions = {
  classifierLoader?: () => Promise<NSpamScoringModel>
  maxAuthors?: number
  maxScoreEntries?: number
}

function normalizePubkey(value: string) {
  return value.trim().toLowerCase()
}

function modelBaseUrl() {
  const viteBaseUrl = import.meta.env?.BASE_URL || '/'
  return `${viteBaseUrl.endsWith('/') ? viteBaseUrl : `${viteBaseUrl}/`}nspam`
}

function abortError(signal: AbortSignal) {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal)
}

function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
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

export class NSpamService {
  private readonly classifierLoader: () => Promise<NSpamScoringModel>
  private readonly maxAuthors: number
  private readonly maxScoreEntries: number
  private readonly notesByPubkey = new Map<string, Map<string, NSpamNoteInput>>()
  private readonly noteRevisionByPubkey = new Map<string, number>()
  private readonly authorOrder: string[] = []
  private readonly scoreEntries = new Map<string, TScoreEntry>()
  private readonly scoreOrder: string[] = []
  private readonly inflightScoreByKey = new Map<string, TInflightScore>()
  private scorerPromise?: Promise<NSpamAuthorScorer>
  private nextNoteRevision = 0
  private nextRevision = 0

  constructor(options: TNSpamServiceOptions = {}) {
    this.classifierLoader =
      options.classifierLoader ?? (() => NSpamClassifier.load({ baseUrl: modelBaseUrl() }))
    this.maxAuthors = options.maxAuthors ?? 2_000
    this.maxScoreEntries = options.maxScoreEntries ?? 2_000
  }

  ingestEvents(events: readonly Event[]) {
    for (const event of events) {
      if (!SCORABLE_KINDS.has(event.kind)) continue
      const pubkey = normalizePubkey(event.pubkey)
      if (!pubkey || !event.id) continue

      const authorNotes = this.notesByPubkey.get(pubkey) ?? new Map<string, NSpamNoteInput>()
      if (authorNotes.has(event.id)) {
        this.touchAuthor(pubkey)
        continue
      }
      authorNotes.set(event.id, {
        content: event.content,
        tags: event.tags,
        createdAt: event.created_at
      })

      if (authorNotes.size > MAX_NOTES_PER_AUTHOR) {
        const newest = [...authorNotes.entries()]
          .sort((lhs, rhs) => {
            const createdAtDifference = rhs[1].createdAt - lhs[1].createdAt
            return createdAtDifference || rhs[0].localeCompare(lhs[0])
          })
          .slice(0, MAX_NOTES_PER_AUTHOR)
        authorNotes.clear()
        newest.forEach(([id, note]) => authorNotes.set(id, note))
      }

      this.notesByPubkey.set(pubkey, authorNotes)
      if (authorNotes.has(event.id)) {
        this.noteRevisionByPubkey.set(pubkey, ++this.nextNoteRevision)
      }
      this.touchAuthor(pubkey)
      this.trimAuthors()
    }
  }

  cachedScore(pubkey: string, signature: string) {
    const normalized = normalizePubkey(pubkey)
    if (!normalized) return undefined
    const key = this.scoreKey(normalized, signature)
    const entry = this.scoreEntries.get(key)
    if (!entry) return undefined

    const currentNoteCount = this.notesFor(normalized).length
    if (entry.noteCount < RESCORE_NOTE_THRESHOLD && currentNoteCount >= RESCORE_NOTE_THRESHOLD) {
      return undefined
    }
    this.touchScore(key)
    return entry.score
  }

  scoreAuthor(pubkey: string, personalization: TNSpamPersonalization, signal?: AbortSignal) {
    const normalized = normalizePubkey(pubkey)
    if (!normalized) return Promise.resolve(undefined)

    const noteRevision = this.noteRevision(normalized)
    const scoreKey = this.scoreKey(normalized, personalization.signature)
    const inflightKey = `${scoreKey}\u001d${noteRevision}`
    let inflight = this.inflightScoreByKey.get(inflightKey)
    if (!inflight) {
      const controller = new AbortController()
      const notesSnapshot = this.notesFor(normalized)
      inflight = {
        consumers: 0,
        controller,
        promise: Promise.resolve(undefined),
        settled: false
      }
      const operation = this.runScoreAuthor(
        normalized,
        personalization,
        scoreKey,
        noteRevision,
        notesSnapshot,
        controller.signal
      ).finally(() => {
        inflight!.settled = true
        if (this.inflightScoreByKey.get(inflightKey) === inflight) {
          this.inflightScoreByKey.delete(inflightKey)
        }
      })
      inflight.promise = operation
      this.inflightScoreByKey.set(inflightKey, inflight)
    }

    return this.consumeInflightScore(inflight, signal)
  }

  noteCount(pubkey: string) {
    return this.notesFor(normalizePubkey(pubkey)).length
  }

  noteRevision(pubkey: string) {
    return this.noteRevisionByPubkey.get(normalizePubkey(pubkey)) ?? 0
  }

  private async runScoreAuthor(
    normalizedPubkey: string,
    personalization: TNSpamPersonalization,
    key: string,
    noteRevision: number,
    notesSnapshot: readonly NSpamNoteInput[],
    signal: AbortSignal
  ) {
    const revision = ++this.nextRevision
    const removeOwnRevision = () => this.removeScore(key, revision)
    signal.addEventListener('abort', removeOwnRevision, { once: true })

    try {
      throwIfAborted(signal)
      const scorer = await waitWithAbort(this.getScorer(), signal)
      const score = await scorer.scoreAuthor({
        pubkey: normalizedPubkey,
        markedSpamPubkeys: [...personalization.markedPubkeys],
        notSpamPubkeys: [...personalization.safelistedPubkeys],
        seedNotes: notesSnapshot,
        signal
      })
      throwIfAborted(signal)

      if (this.noteRevision(normalizedPubkey) !== noteRevision) {
        return undefined
      }
      if (score === null) return this.cachedScore(normalizedPubkey, personalization.signature)

      this.scoreEntries.set(key, {
        noteCount: notesSnapshot.length,
        revision,
        score
      })
      this.touchScore(key)
      this.trimScores()
      throwIfAborted(signal)
      return score
    } catch (error) {
      removeOwnRevision()
      throw error
    } finally {
      signal.removeEventListener('abort', removeOwnRevision)
    }
  }

  private consumeInflightScore(inflight: TInflightScore, signal?: AbortSignal) {
    inflight.consumers += 1
    let released = false
    const release = () => {
      if (released) return
      released = true
      inflight.consumers -= 1
      if (inflight.consumers === 0 && !inflight.settled) {
        inflight.controller.abort()
      }
    }

    try {
      return waitWithAbort(inflight.promise, signal).finally(release)
    } catch (error) {
      release()
      throw error
    }
  }

  private getScorer() {
    if (!this.scorerPromise) {
      const loading = this.classifierLoader().then(
        (classifier) =>
          new NSpamAuthorScorer({
            classifier,
            noteProvider: (pubkey) => this.notesFor(pubkey)
          })
      )
      this.scorerPromise = loading
      void loading.catch(() => {
        if (this.scorerPromise === loading) {
          this.scorerPromise = undefined
        }
      })
    }
    return this.scorerPromise
  }

  private notesFor(pubkey: string) {
    return [...(this.notesByPubkey.get(pubkey)?.entries() ?? [])]
      .sort((lhs, rhs) => {
        const createdAtDifference = rhs[1].createdAt - lhs[1].createdAt
        return createdAtDifference || rhs[0].localeCompare(lhs[0])
      })
      .slice(0, MAX_NOTES_PER_AUTHOR)
      .map(([, note]) => note)
  }

  private scoreKey(pubkey: string, signature: string) {
    return `${pubkey}\u001d${signature}`
  }

  private removeScore(key: string, revision: number) {
    if (this.scoreEntries.get(key)?.revision !== revision) return
    this.scoreEntries.delete(key)
    const index = this.scoreOrder.indexOf(key)
    if (index >= 0) this.scoreOrder.splice(index, 1)
  }

  private touchAuthor(pubkey: string) {
    const index = this.authorOrder.indexOf(pubkey)
    if (index >= 0) this.authorOrder.splice(index, 1)
    this.authorOrder.push(pubkey)
  }

  private touchScore(key: string) {
    const index = this.scoreOrder.indexOf(key)
    if (index >= 0) this.scoreOrder.splice(index, 1)
    this.scoreOrder.push(key)
  }

  private trimAuthors() {
    while (this.notesByPubkey.size > this.maxAuthors) {
      const oldest = this.authorOrder.shift()
      if (!oldest) return
      this.notesByPubkey.delete(oldest)
      this.noteRevisionByPubkey.delete(oldest)
      const scoreKeyPrefix = `${oldest}\u001d`
      for (const key of [...this.scoreEntries.keys()]) {
        if (key.startsWith(scoreKeyPrefix)) {
          this.scoreEntries.delete(key)
          const scoreOrderIndex = this.scoreOrder.indexOf(key)
          if (scoreOrderIndex >= 0) this.scoreOrder.splice(scoreOrderIndex, 1)
        }
      }
    }
  }

  private trimScores() {
    while (this.scoreEntries.size > this.maxScoreEntries) {
      const oldest = this.scoreOrder.shift()
      if (!oldest) return
      this.scoreEntries.delete(oldest)
    }
  }
}

const nspamService = new NSpamService()

export function ingestNSpamEvents(events: readonly Event[]) {
  nspamService.ingestEvents(events)
}

export default nspamService
