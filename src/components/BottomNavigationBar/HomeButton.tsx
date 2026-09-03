import { usePrimaryPage } from '@/PageManager'
import HaloMark from '@/components/HaloMark'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

export default function HomeButton() {
  const { t } = useTranslation()
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'home' && display}
      onClick={() => navigate('home')}
      aria-label={t('Home')}
    >
      <HaloMark className="size-8" />
    </BottomNavigationBarItem>
  )
}
