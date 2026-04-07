import { SEARCHABLE_RELAY_URLS } from '@/constants'
import { useFeed } from '@/providers/FeedProvider'
import client from '@/services/client.service'
import discoveryService from '@/services/discovery.service'
import { TProfile } from '@/types'
import { useEffect, useState } from 'react'
import { useFetchRelayInfos } from './useFetchRelayInfos'

export function useSearchProfiles(search: string, limit: number) {
  const { relayUrls } = useFeed()
  const { searchableRelayUrls } = useFetchRelayInfos(relayUrls)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [profiles, setProfiles] = useState<TProfile[]>([])

  useEffect(() => {
    let active = true

    const mergeProfiles = (...groups: (TProfile[] | null | undefined)[]) => {
      const orderedProfiles: TProfile[] = []
      const existingPubkeys = new Set<string>()

      groups.forEach((profiles) => {
        profiles?.forEach((profile) => {
          if (existingPubkeys.has(profile.pubkey)) {
            return
          }

          existingPubkeys.add(profile.pubkey)
          orderedProfiles.push(profile)
        })
      })

      return orderedProfiles
    }

    const fetchProfiles = async () => {
      if (!search) {
        if (active) {
          setProfiles([])
          setIsFetching(false)
          setError(null)
        }
        return
      }

      if (active) {
        setIsFetching(true)
        setError(null)
        setProfiles([])
      }

      try {
        const localProfiles = await client.searchProfilesFromLocal(search, limit)
        let discoveryProfiles: TProfile[] = []

        if (active) {
          setProfiles(localProfiles)
        }

        try {
          discoveryProfiles = await discoveryService.suggestProfiles(search, limit)
        } catch (error) {
          console.warn('Profile discovery fallback', error)
        }

        const mergedProfiles = mergeProfiles(discoveryProfiles, localProfiles)
        if (active) {
          setProfiles(mergedProfiles)
        }

        if (mergedProfiles.length >= limit) {
          return
        }

        const fetchedProfiles = await client.searchProfiles(
          searchableRelayUrls.concat(SEARCHABLE_RELAY_URLS).slice(0, 4),
          {
            search,
            limit
          }
        )

        if (fetchedProfiles.length && active) {
          setProfiles(mergeProfiles(mergedProfiles, fetchedProfiles))
        }
      } catch (err) {
        if (active) {
          setError(err as Error)
        }
      } finally {
        if (active) {
          setIsFetching(false)
        }
      }
    }

    fetchProfiles()

    return () => {
      active = false
    }
  }, [searchableRelayUrls, search, limit])

  return { isFetching, error, profiles }
}
