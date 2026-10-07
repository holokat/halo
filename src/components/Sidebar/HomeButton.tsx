import { usePrimaryPage } from '@/PageManager'
import { IconHome as Home } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconHome'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function HomeButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem title={t('Home')} onClick={() => navigate('home')} active={current === 'home'}>
      <Home />
    </SidebarItem>
  )
}
