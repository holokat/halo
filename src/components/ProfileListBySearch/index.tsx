import { SEARCHABLE_RELAY_URLS } from '@/constants'
import client from '@/services/client.service'
import discoveryService from '@/services/discovery.service'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import UserItem, { UserItemSkeleton } from '../UserItem'

const LIMIT = 50

export function ProfileListBySearch({ search }: { search: string }) {
  const [until, setUntil] = useState<number>(() => dayjs().unix())
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [pubkeySet, setPubkeySet] = useState(new Set<string>())
  const [mode, setMode] = useState<'discovery' | 'relay' | null>(null)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    requestVersionRef.current += 1
    const nextUntil = dayjs().unix()
    setUntil(nextUntil)
    setOffset(0)
    setHasMore(true)
    setPubkeySet(new Set<string>())
    setMode(null)
    setLoading(false)
    void loadMore({
      force: true,
      nextMode: null,
      nextOffset: 0,
      nextUntil
    })
  }, [search])

  useEffect(() => {
    if (!hasMore) return
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        loadMore()
      }
    }, options)

    const currentBottomRef = bottomRef.current

    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }

    return () => {
      if (observerInstance && currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }
  }, [hasMore, loading, search, until, offset, mode])

  const loadMore = async ({
    force = false,
    nextMode,
    nextOffset,
    nextUntil
  }: {
    force?: boolean
    nextMode?: 'discovery' | 'relay' | null
    nextOffset?: number
    nextUntil?: number
  } = {}) => {
    if (!search || loading || (!force && !hasMore)) {
      return
    }

    setLoading(true)
    const requestVersion = requestVersionRef.current
    const activeMode = nextMode ?? mode
    const activeOffset = nextOffset ?? offset
    const activeUntil = nextUntil ?? until

    try {
      const shouldUseDiscovery = activeMode !== 'relay'
      if (shouldUseDiscovery) {
        try {
          const profiles = await discoveryService.searchProfiles(search, LIMIT, activeOffset)
          if (requestVersion !== requestVersionRef.current) {
            return
          }

          if (profiles.length === 0 && activeOffset === 0) {
            throw new Error('No indexed discovery results')
          }

          setMode('discovery')
          setPubkeySet((prev) => new Set([...prev, ...profiles.map((profile) => profile.pubkey)]))
          setHasMore(profiles.length >= LIMIT)
          setOffset((prev) => prev + profiles.length)
          return
        } catch (error) {
          console.warn('Profile search discovery fallback', error)
        }
      }

      const profiles = await client.searchProfiles(SEARCHABLE_RELAY_URLS, {
        search,
        until: activeUntil,
        limit: LIMIT
      })
      if (requestVersion !== requestVersionRef.current) {
        return
      }

      setMode('relay')
      setPubkeySet((prev) => new Set([...prev, ...profiles.map((profile) => profile.pubkey)]))
      setHasMore(profiles.length >= LIMIT)
      const lastProfileCreatedAt = profiles[profiles.length - 1]?.created_at
      setUntil(lastProfileCreatedAt ? lastProfileCreatedAt - 1 : 0)
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <div className="px-4">
      {Array.from(pubkeySet).map((pubkey, index) => (
        <UserItem key={`${index}-${pubkey}`} pubkey={pubkey} />
      ))}
      {(loading || hasMore) && <UserItemSkeleton />}
      {hasMore && <div ref={bottomRef} />}
    </div>
  )
}
