import { usePrimaryPage } from '@/PageManager'
import { IconMagnifyingGlass as Search } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMagnifyingGlass'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function SearchButton() {
  const { t } = useTranslation()
  const { navigate, current, display } = usePrimaryPage()

  return (
    <SidebarItem
      title={t('Search')}
      onClick={() => navigate('search')}
      active={current === 'search' && display}
    >
      <Search />
    </SidebarItem>
  )
}
