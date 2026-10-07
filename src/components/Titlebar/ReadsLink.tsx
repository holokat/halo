import { usePrimaryPage } from '@/PageManager'
import { Button } from '@/components/ui/button'
import { IconBook as BookOpen } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBook'

export default function ReadsLink() {
  const { navigate, current } = usePrimaryPage()

  return (
    <Button
      variant="ghost"
      size="titlebar-icon"
      onClick={() => navigate('reads')}
      className={current === 'reads' ? 'bg-accent/50' : ''}
    >
      <BookOpen />
    </Button>
  )
}
