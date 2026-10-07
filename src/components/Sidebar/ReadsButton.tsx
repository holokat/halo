import { IconBook as BookOpen } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBook'
import { usePrimaryPage } from '@/PageManager'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function ReadsButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem title={t('Reads')} onClick={() => navigate('reads')} active={current === 'reads'}>
      <BookOpen />
    </SidebarItem>
  )
}
