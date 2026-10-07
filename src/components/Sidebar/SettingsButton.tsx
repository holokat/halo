import { toSettings } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { IconSettingsGear1 as Settings } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSettingsGear1'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function SettingsButton() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()

  return (
    <SidebarItem title={t('Settings')} onClick={() => push(toSettings())}>
      <Settings />
    </SidebarItem>
  )
}
