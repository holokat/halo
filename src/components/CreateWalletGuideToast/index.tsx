import { toWallet } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import storage from '@/services/local-storage.service'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const NEW_USER_WALLET_TOAST_GRACE_PERIOD_SECONDS = 60 * 60 * 24 * 30

export default function CreateWalletGuideToast() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { profile } = useNostr()

  useEffect(() => {
    const accountCreatedAt = profile?.joined_at ?? profile?.created_at
    const isNewUser =
      typeof accountCreatedAt === 'number' &&
      Math.floor(Date.now() / 1000) - accountCreatedAt < NEW_USER_WALLET_TOAST_GRACE_PERIOD_SECONDS

    if (
      profile &&
      !isNewUser &&
      !profile.lightningAddress &&
      !storage.hasShownCreateWalletGuideToast(profile.pubkey)
    ) {
      toast(t('Set up your wallet to send and receive sats!'), {
        action: {
          label: t('Set up'),
          onClick: () => push(toWallet())
        }
      })
      storage.markCreateWalletGuideToastAsShown(profile.pubkey)
    }
  }, [profile, push, t])

  return null
}
