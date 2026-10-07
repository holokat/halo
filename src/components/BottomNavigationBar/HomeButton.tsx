import { usePrimaryPage } from '@/PageManager'
import { IconHome } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconHome'
import { IconHome as SolidHome } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconHome'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

export default function HomeButton() {
  const { t } = useTranslation()
  const { navigate, current, display } = usePrimaryPage()
  const active = current === 'home' && display

  return (
    <BottomNavigationBarItem
      active={active}
      onClick={() => navigate('home')}
      aria-label={t('Home')}
    >
      {active ? <SolidHome /> : <IconHome />}
    </BottomNavigationBarItem>
  )
}
