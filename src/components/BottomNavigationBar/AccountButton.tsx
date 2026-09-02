import { SimpleUserAvatar } from '@/components/UserAvatar'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { CircleUserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function AccountButton() {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'me' && display}
      onClick={() => navigate('me')}
      aria-label={t('Account')}
    >
      {pubkey ? <SimpleUserAvatar userId={pubkey} size="small" /> : <CircleUserRound />}
    </BottomNavigationBarItem>
  )
}
