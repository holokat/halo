import MobileTopNavMenuButton from '@/components/MobileTopNavMenuButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { cn } from '@/lib/utils'
import { ArrowLeft, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TMessageConversation } from '@/providers/MessagesProvider'
import { DirectMessageZapActions } from './messages-page-zap'
import { ConversationAvatar, ConversationTitle } from './messages-page-thread'
import { TMessagesViewMode } from './messages-page.utils'

export function MessagesPageTitlebar({
  viewMode,
  conversation,
  draftRecipientPubkeys,
  unreadMessageCount,
  hasUnreadMessages,
  onBack,
  onCompose,
  onMarkAllAsRead
}: {
  viewMode: TMessagesViewMode
  conversation: TMessageConversation | null
  draftRecipientPubkeys: string[]
  unreadMessageCount: number
  hasUnreadMessages: boolean
  onBack: () => void
  onCompose: () => void
  onMarkAllAsRead: () => void
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()

  if (viewMode === 'thread') {
    const zapTargetPubkey = conversation?.isGroup
      ? null
      : conversation?.primaryPubkey ?? draftRecipientPubkeys[0]

    return (
      <div className="flex items-center h-full pl-1 pr-2 gap-2">
        <Button variant="ghost" size="titlebar-icon" onClick={onBack} aria-label={t('Back')}>
          <ArrowLeft />
        </Button>
        <ConversationAvatar
          conversation={conversation}
          draftRecipientPubkeys={draftRecipientPubkeys}
          size="small"
        />
        <div className="min-w-0 flex-1">
          {conversation || draftRecipientPubkeys.length > 0 ? (
            <ConversationTitle
              conversation={conversation}
              draftRecipientPubkeys={draftRecipientPubkeys}
              className="text-lg font-semibold truncate"
            />
          ) : (
            <div className="text-lg font-semibold truncate">{t('Messages')}</div>
          )}
        </div>
        {conversation?.isRequest && (
          <Badge variant="outline" className="shrink-0">
            {t('Request')}
          </Badge>
        )}
        {zapTargetPubkey && <DirectMessageZapActions pubkey={zapTargetPubkey} />}
      </div>
    )
  }

  if (viewMode === 'compose') {
    return (
      <div className="flex items-center h-full pl-1 pr-2 gap-2">
        <Button variant="ghost" size="titlebar-icon" onClick={onBack} aria-label={t('Back')}>
          <ArrowLeft />
        </Button>
        <div className="text-lg font-semibold truncate" style={{ fontSize: 'var(--title-font-size, 18px)' }}>
          {t('New message')}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between h-full pr-2 gap-2',
        isSmallScreen ? 'pl-1' : 'pl-3'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isSmallScreen && <MobileTopNavMenuButton />}
        <div
          className="text-lg font-semibold truncate"
          style={{ fontSize: `var(--title-font-size, ${isSmallScreen ? 19 : 18}px)` }}
        >
          {t('Messages')}
        </div>
        {unreadMessageCount > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {unreadMessageCount}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onMarkAllAsRead}
          disabled={!hasUnreadMessages}
        >
          {t('Mark all as read')}
        </Button>
        <Button size="sm" className={cn('shrink-0', isSmallScreen && 'text-sm')} onClick={onCompose}>
          <Plus />
          {t('New')}
        </Button>
      </div>
    </div>
  )
}
