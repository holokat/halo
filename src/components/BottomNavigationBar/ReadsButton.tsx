import { usePrimaryPage } from '@/PageManager'
import { IconBook as BookOpen } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBook'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function ReadsButton() {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'reads' && display}
      onClick={() => navigate('reads')}
    >
      <BookOpen />
    </BottomNavigationBarItem>
  )
}
