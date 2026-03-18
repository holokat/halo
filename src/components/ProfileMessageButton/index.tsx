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
      size="icon"
      className="rounded-full"
      aria-label={t('Message')}
      title={t('Message')}
      onClick={() => checkLogin(() => navigate('messages', { composeTo: pubkey }))}
    >
      <MessageCircle />
    </Button>
  )
}
