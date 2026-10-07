import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { IconUser as UserRound } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconUser'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function ProfileButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()
  const { checkLogin } = useNostr()

  return (
    <SidebarItem
      title={t('Profile')}
      onClick={() => checkLogin(() => navigate('profile'))}
      active={current === 'profile'}
    >
      <UserRound />
    </SidebarItem>
  )
}
