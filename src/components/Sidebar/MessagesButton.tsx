import { usePrimaryPage } from '@/PageManager'
import { useDistractionFreeMode } from '@/providers/DistractionFreeModeProvider'
import { useMessages } from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function MessagesButton() {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const { navigate, current } = usePrimaryPage()
  const { hasUnreadMessages } = useMessages()
  const { isDistractionFree } = useDistractionFreeMode()
  const { messageNotificationsEnabled } = useUserPreferences()

  const showUnreadDot = hasUnreadMessages && messageNotificationsEnabled && !isDistractionFree

  return (
    <SidebarItem
      title={t('Messages')}
      onClick={() => checkLogin(() => navigate('messages', { composeTo: undefined }))}
      active={current === 'messages'}
      aria-label={showUnreadDot ? t('Messages') + ', new messages' : t('Messages')}
    >
      <div className="relative">
        <MessageCircle strokeWidth={1.3} />
        {showUnreadDot && (
          <div
            className="absolute -top-1 right-0 w-2 h-2 ring-2 ring-background bg-primary rounded-full"
            aria-hidden="true"
          />
        )}
      </div>
    </SidebarItem>
  )
}
