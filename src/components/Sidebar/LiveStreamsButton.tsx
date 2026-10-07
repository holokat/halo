import { usePrimaryPage } from '@/PageManager'
import { IconRadio as Radio } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconRadio'
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
      <Radio />
    </SidebarItem>
  )
}
