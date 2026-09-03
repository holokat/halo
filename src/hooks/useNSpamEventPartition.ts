import {
  partitionAuthorSpam,
  type TAuthorSpamOptions,
  type TAuthorSpamPartition
} from '@/lib/reply-spam'
import nspamService from '@/services/nspam.service'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type TUseNSpamEventPartitionOptions = Omit<TAuthorSpamOptions, 'cachedScore'>

type TUseNSpamEventPartitionResult = {
  partition: TAuthorSpamPartition
  retry: () => void
  scoringError: boolean
}

const EMPTY_PUBKEYS = new Set<string>()

export function useNSpamEventPartition(
  events: readonly Event[],
  options: TUseNSpamEventPartitionOptions
): TUseNSpamEventPartitionResult {
  const {
    currentPubkey,
    enabled,
    followedPubkeys,
    isFollowed,
    markedPubkeys,
    safelistedPubkeys,
    signature
  } = options
  const [scoreRevision, setScoreRevision] = useState(0)
  const [retryNonce, setRetryNonce] = useState(0)
  const [scoringError, setScoringError] = useState(false)
  const scoringGenerationRef = useRef(0)
  const retryAttemptRef = useRef(0)

  const partition = useMemo(() => {
    void scoreRevision
    return partitionAuthorSpam(events, {
      currentPubkey,
      enabled,
      followedPubkeys,
      isFollowed,
      markedPubkeys,
      safelistedPubkeys,
      signature,
      cachedScore: (authorPubkey, personalizationSignature) =>
        nspamService.cachedScore(authorPubkey, personalizationSignature)
    })
  }, [
    events,
    currentPubkey,
    enabled,
    followedPubkeys,
    isFollowed,
    markedPubkeys,
    safelistedPubkeys,
    signature,
    scoreRevision
  ])

  const pendingWorkKey = partition.pendingPubkeys
    .map((authorPubkey) => `${authorPubkey}:${nspamService.noteRevision(authorPubkey)}`)
    .join('|')

  useEffect(() => {
    retryAttemptRef.current = 0
    setScoringError(false)
  }, [pendingWorkKey, signature])

  useEffect(() => {
    const generation = ++scoringGenerationRef.current
    if (partition.pendingPubkeys.length === 0) return

    const controller = new AbortController()
    let retryTimer: number | undefined
    setScoringError(false)
    const personalization = {
      markedPubkeys: markedPubkeys ?? EMPTY_PUBKEYS,
      safelistedPubkeys: safelistedPubkeys ?? EMPTY_PUBKEYS,
      signature
    }

    void Promise.allSettled(
      partition.pendingPubkeys.map((authorPubkey) =>
        nspamService.scoreAuthor(authorPubkey, personalization, controller.signal)
      )
    ).then((results) => {
      if (controller.signal.aborted || scoringGenerationRef.current !== generation) return
      setScoreRevision((revision) => revision + 1)

      const failed = results.some(
        (result) =>
          result.status === 'rejected' &&
          (result.reason as Error | undefined)?.name !== 'AbortError'
      )
      if (!failed) {
        retryAttemptRef.current = 0
        setScoringError(false)
        return
      }

      setScoringError(true)
      if (retryAttemptRef.current < 2) {
        const retryDelay = 1_000 * 2 ** retryAttemptRef.current
        retryAttemptRef.current += 1
        retryTimer = window.setTimeout(() => {
          setRetryNonce((nonce) => nonce + 1)
        }, retryDelay)
      }
    })

    return () => {
      controller.abort()
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [pendingWorkKey, signature, markedPubkeys, safelistedPubkeys, retryNonce])

  const retry = useCallback(() => {
    retryAttemptRef.current = 0
    setScoringError(false)
    setRetryNonce((nonce) => nonce + 1)
  }, [])

  return { partition, retry, scoringError }
}
