import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useNotification } from '@/providers/NotificationProvider'
import { Bell } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

export default function NotificationsButton() {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const { navigate, current, display } = usePrimaryPage()
  const { hasNewNotification } = useNotification()
  const active = current === 'notifications' && display

  return (
    <BottomNavigationBarItem
      active={active}
      onClick={() => checkLogin(() => navigate('notifications'))}
      aria-label={t('Notifications')}
    >
      <div className="relative">
        <Bell fill={active ? 'currentColor' : 'none'} />
        {hasNewNotification && (
          <div className="absolute -top-0.5 right-0.5 w-2 h-2 ring-2 ring-background bg-primary rounded-full" />
        )}
      </div>
    </BottomNavigationBarItem>
  )
}
