import { usePrimaryPage } from '@/PageManager'
import { IconListBullets as List } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconListBullets'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function ListsButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem title={t('Lists')} onClick={() => navigate('lists')} active={current === 'lists'}>
      <List />
    </SidebarItem>
  )
}
