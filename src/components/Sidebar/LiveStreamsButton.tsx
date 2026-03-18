import { usePrimaryPage } from '@/PageManager'
import { Radio } from 'lucide-react'
import SidebarItem from './SidebarItem'
import { useTranslation } from 'react-i18next'

export default function LiveStreamsButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem
      title={t('Live Streams')}
      onClick={() => navigate('livestreams')}
      active={current === 'livestreams'}
    >
      <Radio strokeWidth={1.3} />
    </SidebarItem>
  )
}
