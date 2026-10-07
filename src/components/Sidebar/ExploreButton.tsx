import { usePrimaryPage } from '@/PageManager'
import { IconMagnifyingGlass as Search } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMagnifyingGlass'
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
      <Search />
    </SidebarItem>
  )
}
