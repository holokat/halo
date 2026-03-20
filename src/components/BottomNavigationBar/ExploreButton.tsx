import { usePrimaryPage } from '@/PageManager'
import { Search } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function ExploreButton() {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'explore' && display}
      onClick={() => navigate('explore')}
    >
      <Search />
    </BottomNavigationBarItem>
  )
}
