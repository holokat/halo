import { IconMagnifyingGlass as SolidSearch } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconMagnifyingGlass'
import { usePrimaryPage } from '@/PageManager'
import { IconMagnifyingGlass as Search } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMagnifyingGlass'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

export default function ExploreButton() {
  const { t } = useTranslation()
  const { navigate, current, display } = usePrimaryPage()
  const active = current === 'explore' && display

  return (
    <BottomNavigationBarItem
      active={active}
      onClick={() => navigate('explore')}
      aria-label={t('Search')}
    >
      {active ? <SolidSearch /> : <Search />}
    </BottomNavigationBarItem>
  )
}
