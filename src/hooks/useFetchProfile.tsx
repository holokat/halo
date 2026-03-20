import { userIdToPubkey } from '@/lib/pubkey'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { TProfile } from '@/types'
import { useEffect, useState } from 'react'

const inFlightProfileFetchMap = new Map<string, Promise<TProfile | undefined>>()

function getOrCreateInFlightProfileFetch(pubkey: string, skipCache: boolean) {
  const key = `${pubkey}:${skipCache ? '1' : '0'}`
  const existingPromise = inFlightProfileFetchMap.get(key)
  if (existingPromise) {
    return existingPromise
  }

  const fetchPromise = client.fetchProfile(pubkey, skipCache)
  inFlightProfileFetchMap.set(key, fetchPromise)
  return fetchPromise.finally(() => {
    if (inFlightProfileFetchMap.get(key) === fetchPromise) {
      inFlightProfileFetchMap.delete(key)
    }
  })
}

export function useFetchProfile(id?: string, skipCache = false) {
  const { profile: currentAccountProfile } = useNostr()
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [profile, setProfile] = useState<TProfile | null>(null)
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setPubkey(null)
    setError(null)
    const fetchProfile = async () => {
      setIsFetching(true)
      try {
        if (!id) {
          if (cancelled) return
          setIsFetching(false)
          return
        }

        const pubkey = userIdToPubkey(id)
        if (cancelled) return
        setPubkey(pubkey)

        // Check in-memory cache first for instant access
        if (!skipCache) {
          const cachedProfile = client.getCachedProfile(pubkey)
          if (cachedProfile) {
            if (cancelled) return
            setProfile(cachedProfile)
            setIsFetching(false)
            return
          }
        }

        const profile = await getOrCreateInFlightProfileFetch(pubkey, skipCache)
        if (cancelled) return
        if (profile) {
          setProfile(profile)
        }
      } catch (err) {
        if (cancelled) return
        setError(err as Error)
      } finally {
        if (!cancelled) {
          setIsFetching(false)
        }
      }
    }

    fetchProfile()

    return () => {
      cancelled = true
    }
  }, [id, skipCache])

  useEffect(() => {
    if (currentAccountProfile && pubkey === currentAccountProfile.pubkey) {
      setProfile(currentAccountProfile)
    }
  }, [currentAccountProfile, pubkey])

  return { isFetching, error, profile }
}
