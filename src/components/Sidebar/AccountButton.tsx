import { SimpleUserAvatar } from '@/components/UserAvatar'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { IconCirclePerson as CircleUserRound } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCirclePerson'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function AccountButton() {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { current, navigate } = usePrimaryPage()

  return (
    <SidebarItem title={t('Account')} onClick={() => navigate('me')} active={current === 'me'}>
      {pubkey ? (
        <SimpleUserAvatar userId={pubkey} size="small" />
      ) : (
        <CircleUserRound />
      )}
    </SidebarItem>
  )
}
