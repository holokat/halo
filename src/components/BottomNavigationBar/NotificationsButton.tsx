import { IconBell as FilledBell } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconBell'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useNotification } from '@/providers/NotificationProvider'
import { IconBell as Bell } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBell'
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
        {active ? <FilledBell /> : <Bell />}
        {hasNewNotification && (
          <div className="absolute -top-0.5 right-0.5 w-2 h-2 ring-2 ring-background bg-primary rounded-full" />
        )}
      </div>
    </BottomNavigationBarItem>
  )
}
