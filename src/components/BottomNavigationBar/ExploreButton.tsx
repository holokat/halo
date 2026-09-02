import { usePrimaryPage } from '@/PageManager'
import { Search } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

export default function ExploreButton() {
  const { t } = useTranslation()
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'explore' && display}
      onClick={() => navigate('explore')}
      aria-label={t('Search')}
    >
      <Search />
    </BottomNavigationBarItem>
  )
}
