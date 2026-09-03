import { usePrimaryPage } from '@/PageManager'
import { Search } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'
import { useTranslation } from 'react-i18next'

function SolidSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10.5 3a7.5 7.5 0 1 0 4.61 13.42l4.24 4.23a.92.92 0 0 0 1.3-1.3l-4.23-4.24A7.5 7.5 0 0 0 10.5 3Zm-5 7.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

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
