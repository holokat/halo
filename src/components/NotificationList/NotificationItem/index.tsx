import { ExtendedKind } from '@/constants'
import { notificationFilter } from '@/lib/notification'
import { isSpamMarkedPubkey } from '@/lib/spam-filter'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useSpamFilter } from '@/providers/SpamFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { Event, kinds } from 'nostr-tools'
import { useMemo } from 'react'
import { MentionNotification } from './MentionNotification'
import { PollResponseNotification } from './PollResponseNotification'
import { ReactionNotification } from './ReactionNotification'
import { RepostNotification } from './RepostNotification'

export function NotificationItem({
  notification,
  isNew = false
}: {
  notification: Event
  isNew?: boolean
}) {
  const { pubkey } = useNostr()
  const { markedPubkeys } = useSpamFilter()
  const { mutePubkeySet, getMutedWords, getMutedTags } = useMuteList()
  const { hideContentMentioningMutedUsers, hideNotificationsFromMutedUsers } = useContentPolicy()
  const { hideUntrustedNotifications, isUserTrusted } = useUserTrust()
  const mutedWords = getMutedWords()
  const mutedTags = getMutedTags()
  const canShow = useMemo(() => {
    if (isSpamMarkedPubkey(notification.pubkey, markedPubkeys)) return false

    return notificationFilter(notification, {
      pubkey,
      mutePubkeySet,
      hideContentMentioningMutedUsers,
      hideNotificationsFromMutedUsers,
      hideUntrustedNotifications,
      isUserTrusted,
      mutedWords,
      mutedTags,
      getProfile: (pubkey: string) => client.getCachedProfile(pubkey)
    })
  }, [
    notification,
    markedPubkeys,
    mutePubkeySet,
    hideContentMentioningMutedUsers,
    hideNotificationsFromMutedUsers,
    hideUntrustedNotifications,
    isUserTrusted,
    mutedWords,
    mutedTags
  ])
  if (!canShow) return null

  if (notification.kind === kinds.Reaction) {
    return <ReactionNotification notification={notification} isNew={isNew} />
  }
  if (
    notification.kind === kinds.ShortTextNote ||
    notification.kind === ExtendedKind.COMMENT ||
    notification.kind === ExtendedKind.VOICE_COMMENT ||
    notification.kind === ExtendedKind.POLL
  ) {
    return <MentionNotification notification={notification} isNew={isNew} />
  }
  if (notification.kind === kinds.Repost) {
    return <RepostNotification notification={notification} isNew={isNew} />
  }
  if (notification.kind === ExtendedKind.POLL_RESPONSE) {
    return <PollResponseNotification notification={notification} isNew={isNew} />
  }
  return null
}
