import { deleteDraftEventCache } from '@/lib/draft-event'
import client from '@/services/client.service'
import scheduledPostsService, { scheduledPostsChangedEventName } from '@/services/scheduled-posts.service'
import { TDraftEvent, TAccountPointer, TPublishOptions } from '@/types'
import { TFunction } from 'i18next'
import { MutableRefObject, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Event } from 'nostr-tools'

type TScheduledPostsDeps = {
  account: TAccountPointer | null
  isInitialized: boolean
  publish: (draftEvent: TDraftEvent, options?: TPublishOptions) => Promise<Event>
  t: TFunction
  activeAccountRef: MutableRefObject<TAccountPointer | null>
  scheduledPostProcessingIdsRef: MutableRefObject<Set<string>>
  scheduledPostFailureToastAtRef: MutableRefObject<Map<string, number>>
}

const SCHEDULED_POSTS_HEARTBEAT_MS = 30_000

export function useScheduledPostsProcessor({
  account,
  isInitialized,
  publish,
  t,
  activeAccountRef,
  scheduledPostProcessingIdsRef,
  scheduledPostFailureToastAtRef
}: TScheduledPostsDeps) {
  const processScheduledPosts = useCallback(async () => {
    if (!isInitialized || !account || account.signerType === 'npub') {
      return
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }

    const duePosts = scheduledPostsService.getReadyScheduledPosts(account.pubkey)
    for (const scheduledPost of duePosts) {
      if (scheduledPostProcessingIdsRef.current.has(scheduledPost.id)) {
        continue
      }

      scheduledPostProcessingIdsRef.current.add(scheduledPost.id)
      let draftEvent: TDraftEvent | null = null

      try {
        const activeAccount = activeAccountRef.current
        if (!activeAccount || activeAccount.pubkey !== scheduledPost.accountPubkey) {
          continue
        }

        const scheduledDraft =
          await scheduledPostsService.createDraftEventFromScheduledPost(scheduledPost)
        draftEvent = scheduledDraft.draftEvent

        const event = await publish(draftEvent, scheduledDraft.publishOptions)
        client.addEventToCache(event)
        scheduledPostsService.removeScheduledPost(scheduledPost.id)
        scheduledPostFailureToastAtRef.current.delete(scheduledPost.id)
        toast.success(t('Scheduled post published'), { duration: 3000 })
      } catch (error) {
        console.error('Failed to publish scheduled post:', error)
        scheduledPostsService.markAttemptFailed(scheduledPost.id, error)

        const now = Date.now()
        const lastToastAt = scheduledPostFailureToastAtRef.current.get(scheduledPost.id) ?? 0
        if (now - lastToastAt > 5 * 60 * 1000) {
          toast.error(
            t('A scheduled post could not be sent. We will retry when this account is active.'),
            { duration: 5000 }
          )
          scheduledPostFailureToastAtRef.current.set(scheduledPost.id, now)
        }
      } finally {
        if (draftEvent) {
          deleteDraftEventCache(draftEvent)
        }
        scheduledPostProcessingIdsRef.current.delete(scheduledPost.id)
      }
    }
  }, [account, activeAccountRef, isInitialized, publish, scheduledPostFailureToastAtRef, scheduledPostProcessingIdsRef, t])

  useEffect(() => {
    if (!isInitialized) return

    let isDisposed = false
    let isRunning = false
    let runQueued = false
    let worker: Worker | null = null
    let heartbeatIntervalId: number | null = null
    let nextRunTimeoutId: number | null = null

    const clearMainThreadTimers = () => {
      if (heartbeatIntervalId !== null) {
        window.clearInterval(heartbeatIntervalId)
        heartbeatIntervalId = null
      }
      if (nextRunTimeoutId !== null) {
        window.clearTimeout(nextRunTimeoutId)
        nextRunTimeoutId = null
      }
    }

    const getNextRunAtMs = () => {
      if (!account || account.signerType === 'npub') return null
      const nextRunAt = scheduledPostsService.getNextScheduledRunAt(account.pubkey)
      return typeof nextRunAt === 'number' ? nextRunAt * 1000 : null
    }

    const queueRun = () => {
      if (isDisposed) return
      if (isRunning) {
        runQueued = true
        return
      }
      void run()
    }

    const scheduleMainThreadNextRun = () => {
      if (nextRunTimeoutId !== null) {
        window.clearTimeout(nextRunTimeoutId)
        nextRunTimeoutId = null
      }

      const nextRunAtMs = getNextRunAtMs()
      if (!nextRunAtMs) return

      const delay = Math.max(250, nextRunAtMs - Date.now())
      nextRunTimeoutId = window.setTimeout(() => {
        nextRunTimeoutId = null
        queueRun()
      }, delay)
    }

    const configureTicker = () => {
      const nextRunAtMs = getNextRunAtMs()
      if (worker) {
        worker.postMessage({
          type: 'configure',
          nextRunAtMs,
          heartbeatMs: SCHEDULED_POSTS_HEARTBEAT_MS
        })
        return
      }
      scheduleMainThreadNextRun()
    }

    const run = async () => {
      if (isDisposed || isRunning) return
      isRunning = true
      try {
        await processScheduledPosts()
      } finally {
        isRunning = false
        configureTicker()
        if (runQueued) {
          runQueued = false
          queueRun()
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queueRun()
      }
    }

    const handleScheduledPostsChanged = () => {
      configureTicker()
      queueRun()
    }

    const handleFocus = () => {
      queueRun()
    }

    if (typeof Worker !== 'undefined') {
      try {
        worker = new Worker(
          new URL('../../workers/scheduled-posts-ticker.worker.ts', import.meta.url),
          { type: 'module' }
        )
        worker.onmessage = (event: MessageEvent<{ type: 'tick'; atMs: number; reason: string }>) => {
          if (event.data?.type !== 'tick') return
          if (document.visibilityState !== 'visible') return
          queueRun()
        }
        worker.onerror = (event) => {
          console.error('Scheduled posts ticker worker failed:', event)
          worker?.terminate()
          worker = null
          clearMainThreadTimers()
          heartbeatIntervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
              queueRun()
            }
          }, SCHEDULED_POSTS_HEARTBEAT_MS)
          scheduleMainThreadNextRun()
        }
        configureTicker()
      } catch (error) {
        console.error('Failed to initialize scheduled posts ticker worker:', error)
        worker = null
      }
    }

    if (!worker) {
      heartbeatIntervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          queueRun()
        }
      }, SCHEDULED_POSTS_HEARTBEAT_MS)
      scheduleMainThreadNextRun()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener(scheduledPostsChangedEventName, handleScheduledPostsChanged)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    queueRun()

    return () => {
      isDisposed = true
      clearMainThreadTimers()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener(scheduledPostsChangedEventName, handleScheduledPostsChanged)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (worker) {
        worker.postMessage({ type: 'stop' })
        worker.terminate()
        worker = null
      }
    }
  }, [account, isInitialized, processScheduledPosts])
}
