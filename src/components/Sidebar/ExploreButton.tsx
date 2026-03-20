import { usePrimaryPage } from '@/PageManager'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function RelaysButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem
      title={t('Search')}
      onClick={() => navigate('explore')}
      active={current === 'explore'}
    >
      <Search strokeWidth={1.3} />
    </SidebarItem>
  )
}
