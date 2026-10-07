import ParentNotePreview from '@/components/ParentNotePreview'
import { NOTIFICATION_LIST_STYLE } from '@/constants'
import { getEmbeddedPubkeys, getParentBech32Id } from '@/lib/event'
import { toNote } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { IconAt as AtSign } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconAt'
import { IconChatBubble7 as MessageCircle } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconChatBubble7'
import { IconOpenQuote1 as Quote } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconOpenQuote1'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Notification from './Notification'

export function MentionNotification({
  notification,
  isNew = false
}: {
  notification: Event
  isNew?: boolean
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { pubkey } = useNostr()
  const { notificationListStyle } = useUserPreferences()
  const isMention = useMemo(() => {
    if (!pubkey) return false
    const mentions = getEmbeddedPubkeys(notification)
    return mentions.includes(pubkey)
  }, [pubkey, notification])
  const parentEventId = useMemo(() => getParentBech32Id(notification), [notification])

  return (
    <Notification
      notificationId={notification.id}
      icon={
        isMention ? (
          <AtSign size={24} className="text-pink-400" />
        ) : parentEventId ? (
          <MessageCircle size={24} className="text-blue-400" />
        ) : (
          <Quote size={24} className="text-green-400" />
        )
      }
      sender={notification.pubkey}
      sentAt={notification.created_at}
      targetEvent={notification}
      middle={
        notificationListStyle === NOTIFICATION_LIST_STYLE.DETAILED &&
        parentEventId && (
          <ParentNotePreview
            eventId={parentEventId}
            className=""
            onClick={(e) => {
              e.stopPropagation()
              push(toNote(parentEventId))
            }}
          />
        )
      }
      description={
        isMention ? t('mentioned you in a note') : parentEventId ? '' : t('quoted your note')
      }
      isNew={isNew}
      showStats
    />
  )
}
