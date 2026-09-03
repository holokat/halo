import MobileTopNavMenuButton from '@/components/MobileTopNavMenuButton'
import { usePrimaryPage } from '@/PageManager'

export default function AccountButton() {
  const { current, display } = usePrimaryPage()

  return <MobileTopNavMenuButton variant="bottom-navigation" active={current === 'me' && display} />
}
