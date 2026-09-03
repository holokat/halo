import { usePrimaryPage } from '@/PageManager'
import HaloMark from '@/components/HaloMark'
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
      <HaloMark className={active ? 'size-8 text-foreground' : 'size-8 text-muted-foreground'} />
    </BottomNavigationBarItem>
  )
}
