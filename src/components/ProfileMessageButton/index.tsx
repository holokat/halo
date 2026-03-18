import { usePrimaryPage } from '@/PageManager'
import { Button } from '@/components/ui/button'
import { useNostr } from '@/providers/NostrProvider'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function ProfileMessageButton({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { navigate } = usePrimaryPage()
  const { account, pubkey: accountPubkey, checkLogin } = useNostr()

  if (pubkey === accountPubkey || account?.signerType === 'npub') {
    return null
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="rounded-full px-3"
      onClick={() => checkLogin(() => navigate('messages', { composeTo: pubkey }))}
    >
      <MessageCircle />
      {t('Message')}
    </Button>
  )
}
