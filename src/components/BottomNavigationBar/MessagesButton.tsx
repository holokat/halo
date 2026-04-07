import { usePrimaryPage } from '@/PageManager'
import { useDistractionFreeMode } from '@/providers/DistractionFreeModeProvider'
import { useMessages } from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { MessageCircle } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function MessagesButton() {
  const { checkLogin } = useNostr()
  const { navigate, current, display } = usePrimaryPage()
  const { hasUnreadMessages } = useMessages()
  const { isDistractionFree } = useDistractionFreeMode()
  const { messageNotificationsEnabled } = useUserPreferences()
  const showUnreadDot = hasUnreadMessages && messageNotificationsEnabled && !isDistractionFree

  return (
    <BottomNavigationBarItem
      active={current === 'messages' && display}
      onClick={() =>
        checkLogin(() =>
          navigate('messages', {
            composeTo: undefined,
            composeRequestId: Date.now()
          })
        )
      }
      aria-label={showUnreadDot ? 'Messages, new messages' : 'Messages'}
    >
      <div className="relative">
        <MessageCircle />
        {showUnreadDot && (
          <div
            className="absolute -top-0.5 right-0.5 w-2 h-2 ring-2 ring-background bg-primary rounded-full"
            aria-hidden="true"
          />
        )}
      </div>
    </BottomNavigationBarItem>
  )
}
