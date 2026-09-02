import { getNoteBech32Id } from '@/lib/event'
import { toNlink } from '@/lib/link'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { usePinList } from '@/providers/PinListProvider'
import { useSpamFilter } from '@/providers/SpamFilterProvider'
import {
  Bell,
  BellOff,
  Link,
  Pin,
  PinOff,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import { type Event, kinds } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export interface SubMenuAction {
  label: React.ReactNode
  onClick: () => void
  className?: string
  separator?: boolean
}

export interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick?: () => void
  className?: string
  separator?: boolean
  subMenu?: SubMenuAction[]
}

export function useMenuActions({
  event,
  closeDrawer,
  setIsReportDialogOpen
}: {
  event: Event
  closeDrawer: () => void
  setIsReportDialogOpen: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { pubkey, attemptDelete, checkLogin } = useNostr()
  const { mutePubkey, unmutePubkey, mutePubkeySet } = useMuteList()
  const { pinnedEventHexIdSet, pin, unpin } = usePinList()
  const { markedPubkeys, markSpam, removeSpamMark } = useSpamFilter()
  const isMuted = mutePubkeySet.has(event.pubkey)
  const isMarkedSpam = markedPubkeys.has(event.pubkey.trim().toLowerCase())

  return useMemo(() => {
    const actions: MenuAction[] = [
      {
        icon: Link,
        label: t('Copy link'),
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(toNlink(getNoteBech32Id(event)))
            toast.success(t('Link copied', { defaultValue: 'Link copied' }))
          } catch (error) {
            console.error('Failed to copy share link:', error)
            toast.error(t('Failed to copy'))
          }
          closeDrawer()
        }
      }
    ]

    if (event.pubkey === pubkey && event.kind === kinds.ShortTextNote) {
      const pinned = pinnedEventHexIdSet.has(event.id)
      actions.push({
        icon: pinned ? PinOff : Pin,
        label: pinned ? t('Unpin from profile') : t('Pin to profile'),
        onClick: async () => {
          closeDrawer()
          await (pinned ? unpin(event) : pin(event))
        },
        separator: true
      })
    }

    if (pubkey && event.pubkey !== pubkey) {
      actions.push(
        {
          icon: isMarkedSpam ? ShieldCheck : ShieldAlert,
          label: isMarkedSpam
            ? t('Remove spam mark', { defaultValue: 'Remove spam mark' })
            : t('Mark as spam', { defaultValue: 'Mark as spam' }),
          onClick: () => {
            closeDrawer()
            if (isMarkedSpam) {
              removeSpamMark(event.pubkey)
              toast.success(t('Spam mark removed', { defaultValue: 'Spam mark removed' }))
            } else {
              markSpam(event.pubkey)
              toast.success(t('Author marked as spam', { defaultValue: 'Author marked as spam' }))
            }
          },
          separator: true
        },
        {
          icon: isMuted ? Bell : BellOff,
          label: isMuted ? t('Unmute user') : t('Mute user'),
          onClick: () => {
            closeDrawer()
            if (isMuted) {
              unmutePubkey(event.pubkey)
              toast.success(t('User unmuted', { defaultValue: 'User unmuted' }))
            } else {
              mutePubkey(event.pubkey)
              toast.success(t('User muted', { defaultValue: 'User muted' }))
            }
          },
          className: 'text-destructive focus:text-destructive'
        }
      )
    }

    actions.push({
      icon: TriangleAlert,
      label: t('Report'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => {
        closeDrawer()
        void checkLogin(() => setIsReportDialogOpen(true))
      },
      separator: true
    })

    if (pubkey && event.pubkey === pubkey) {
      actions.push({
        icon: Trash2,
        label: t('Delete note', { defaultValue: 'Delete note' }),
        onClick: () => {
          closeDrawer()
          attemptDelete(event)
        },
        className: 'text-destructive focus:text-destructive',
        separator: true
      })
    }

    return actions
  }, [
    attemptDelete,
    checkLogin,
    closeDrawer,
    event,
    isMarkedSpam,
    isMuted,
    markSpam,
    mutePubkey,
    pinnedEventHexIdSet,
    pin,
    pubkey,
    removeSpamMark,
    setIsReportDialogOpen,
    t,
    unmutePubkey,
    unpin
  ])
}
