import { userIdToPubkey } from '@/lib/pubkey'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { TProfile } from '@/types'
import { useEffect, useMemo, useState } from 'react'

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
  const resolvedPubkey = useMemo(() => (id ? userIdToPubkey(id) : null), [id])
  const getImmediateProfile = () => {
    if (!resolvedPubkey) {
      return null
    }

    if (currentAccountProfile && currentAccountProfile.pubkey === resolvedPubkey) {
      return currentAccountProfile
    }

    if (!skipCache) {
      return client.getCachedProfile(resolvedPubkey)
    }

    return null
  }
  const [profile, setProfile] = useState<TProfile | null>(() => getImmediateProfile())
  const [isFetching, setIsFetching] = useState(() => Boolean(resolvedPubkey && !getImmediateProfile()))
  const [error, setError] = useState<Error | null>(null)
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)

    const fetchProfile = async () => {
      try {
        if (!resolvedPubkey) {
          if (cancelled) return
          setProfile(null)
          setPubkey(null)
          setIsFetching(false)
          return
        }

        const immediateProfile = getImmediateProfile()
        if (cancelled) return
        setPubkey(resolvedPubkey)
        if (immediateProfile) {
          setProfile(immediateProfile)
          setIsFetching(false)
          return
        }

        setProfile(null)
        setIsFetching(true)

        const profile = await getOrCreateInFlightProfileFetch(resolvedPubkey, skipCache)
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
  }, [resolvedPubkey, skipCache, currentAccountProfile])

  useEffect(() => {
    if (currentAccountProfile && pubkey === currentAccountProfile.pubkey) {
      setProfile(currentAccountProfile)
    }
  }, [currentAccountProfile, pubkey])

  return { isFetching, error, profile }
}
