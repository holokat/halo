import NoteList from '@/components/NoteList'
import { POLL_KINDS } from '@/constants'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import { useEffect, useState } from 'react'

export default function PollsFeed() {
  const { pubkey } = useNostr()
  const { feedInfo } = useFeed()
  const { hideUntrustedNotes } = useUserTrust()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (feedInfo.feedType !== 'polls' || !pubkey) {
        setSubRequests([])
        return
      }

      const followings = await client.fetchFollowings(pubkey)
      if (cancelled) return

      setSubRequests(await client.generateSubRequestsForPubkeys([pubkey, ...followings], pubkey))
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [feedInfo.feedType, pubkey])

  return (
    <NoteList
      subRequests={subRequests}
      showKinds={[...POLL_KINDS]}
      isMainFeed
      hideReplies
      hideUntrustedNotes={hideUntrustedNotes}
    />
  )
}
