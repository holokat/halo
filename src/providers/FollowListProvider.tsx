import { BIG_RELAY_URLS } from '@/constants'
import { createFollowListDraftEvent } from '@/lib/draft-event'
import { getPubkeysFromPTags } from '@/lib/tag'
import client from '@/services/client.service'
import { Event } from 'nostr-tools'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNostr } from '@/providers/NostrProvider'

type TFollowListContext = {
  followings: string[]
  follow: (pubkey: string) => Promise<void>
  followMultiple: (pubkeys: string[]) => Promise<void>
  unfollow: (pubkey: string) => Promise<void>
}

const FollowListContext = createContext<TFollowListContext | undefined>(undefined)

export const useFollowList = () => {
  const context = useContext(FollowListContext)
  if (!context) {
    throw new Error('useFollowList must be used within a FollowListProvider')
  }
  return context
}

export function FollowListProvider({ children }: { children: React.ReactNode }) {
  const {
    pubkey: accountPubkey,
    relayList,
    followListEvent,
    signEvent,
    updateFollowListEvent
  } = useNostr()
  const [optimisticFollowListEvent, setOptimisticFollowListEvent] = useState<Event | null>(null)
  const committedFollowListEventRef = useRef<Event | null>(followListEvent)
  const optimisticFollowListEventRef = useRef<Event | null>(null)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const effectiveFollowListEvent = optimisticFollowListEvent ?? followListEvent
  const followings = useMemo(
    () => (effectiveFollowListEvent ? getPubkeysFromPTags(effectiveFollowListEvent.tags) : []),
    [effectiveFollowListEvent]
  )

  useEffect(() => {
    committedFollowListEventRef.current = followListEvent
  }, [followListEvent])

  useEffect(() => {
    optimisticFollowListEventRef.current = optimisticFollowListEvent
  }, [optimisticFollowListEvent])

  useEffect(() => {
    setOptimisticFollowListEvent(null)
    mutationQueueRef.current = Promise.resolve()
  }, [accountPubkey])

  const getFollowPublishRelayUrls = () => {
    return Array.from(new Set([...(relayList?.write.slice(0, 10) ?? []), ...BIG_RELAY_URLS]))
  }

  const loadMutableFollowListEvent = async () => {
    if (!accountPubkey) {
      return null
    }

    if (optimisticFollowListEventRef.current) {
      return optimisticFollowListEventRef.current
    }

    if (committedFollowListEventRef.current) {
      return committedFollowListEventRef.current
    }

    const cachedFollowListEvent = await client.fetchFollowListEvent(accountPubkey)
    if (cachedFollowListEvent) {
      return cachedFollowListEvent
    }

    const refreshedFollowListEvent = await client.fetchFollowListEvent(accountPubkey, { refresh: true })
    return refreshedFollowListEvent ?? committedFollowListEventRef.current
  }

  const queueFollowListMutation = async (
    createNextEvent: (currentFollowListEvent: Event | null) => Promise<Event | null>
  ) => {
    const runMutation = async () => {
      const nextFollowListEvent = await createNextEvent(await loadMutableFollowListEvent())
      if (!nextFollowListEvent) {
        return
      }

      setOptimisticFollowListEvent(nextFollowListEvent)

      try {
        await client.publishEvent(getFollowPublishRelayUrls(), nextFollowListEvent, {
          minSuccessCount: 1
        })
        await updateFollowListEvent(nextFollowListEvent)
      } finally {
        setOptimisticFollowListEvent((current) => {
          if (current?.id === nextFollowListEvent.id) {
            return null
          }
          return current
        })
      }
    }

    const queuedMutation = mutationQueueRef.current.then(runMutation)
    mutationQueueRef.current = queuedMutation.catch(() => undefined)
    return queuedMutation
  }

  const follow = async (pubkey: string) => {
    if (!accountPubkey) return

    await queueFollowListMutation(async (currentFollowListEvent) => {
      if (currentFollowListEvent && getPubkeysFromPTags(currentFollowListEvent.tags).includes(pubkey)) {
        return null
      }

      const newFollowListDraftEvent = createFollowListDraftEvent(
        (currentFollowListEvent?.tags ?? []).concat([['p', pubkey]]),
        currentFollowListEvent?.content
      )
      return await signEvent(newFollowListDraftEvent)
    })
  }

  const followMultiple = async (pubkeys: string[]) => {
    if (!accountPubkey || pubkeys.length === 0) return

    await queueFollowListMutation(async (currentFollowListEvent) => {
      const existingPubkeySet = new Set(
        currentFollowListEvent?.tags
          .filter(([tagName]) => tagName === 'p')
          .map(([, currentPubkey]) => currentPubkey) ?? []
      )
      const newPubkeys = Array.from(new Set(pubkeys)).filter(
        (currentPubkey) => !existingPubkeySet.has(currentPubkey)
      )

      if (newPubkeys.length === 0) {
        return null
      }

      const newFollowListDraftEvent = createFollowListDraftEvent(
        (currentFollowListEvent?.tags ?? []).concat(
          newPubkeys.map((currentPubkey) => ['p', currentPubkey] as [string, string])
        ),
        currentFollowListEvent?.content
      )
      return await signEvent(newFollowListDraftEvent)
    })
  }

  const unfollow = async (pubkey: string) => {
    if (!accountPubkey) return

    await queueFollowListMutation(async (currentFollowListEvent) => {
      if (!currentFollowListEvent) {
        return null
      }

      const newFollowListDraftEvent = createFollowListDraftEvent(
        currentFollowListEvent.tags.filter(
          ([tagName, tagValue]) => tagName !== 'p' || tagValue !== pubkey
        ),
        currentFollowListEvent.content
      )
      return await signEvent(newFollowListDraftEvent)
    })
  }

  return (
    <FollowListContext.Provider
      value={{
        followings,
        follow,
        followMultiple,
        unfollow
      }}
    >
      {children}
    </FollowListContext.Provider>
  )
}
