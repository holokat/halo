import { useEffect, useRef, useState } from 'react'
import { useOptionalNostr } from '@/providers/NostrProvider'
import InviteWelcomeFlow from '@/components/InviteWelcomeFlow'
import InviteWelcomeDialog from '@/components/InviteWelcomeDialog'
import { decodeInviteNpub, removeInviteParam } from '@/lib/invite'

type TInviteMode = 'signup' | 'existing-account'

/**
 * Component that handles invite link acceptance
 * Checks for ?invite=npub parameter and shows welcome flow
 */
export default function InviteHandler() {
  const nostr = useOptionalNostr()
  const pubkey = nostr?.pubkey ?? null
  const isInitialized = nostr?.isInitialized ?? false
  const hasProcessedInvite = useRef(false)
  const [showWelcomeFlow, setShowWelcomeFlow] = useState(false)
  const [inviterPubkey, setInviterPubkey] = useState<string | null>(null)
  const [inviteMode, setInviteMode] = useState<TInviteMode | null>(null)

  useEffect(() => {
    if (!isInitialized || hasProcessedInvite.current) return

    const currentUrl = new URL(window.location.href)
    const inviterPk = decodeInviteNpub(currentUrl.searchParams.get('invite'))
    if (!inviterPk) return

    hasProcessedInvite.current = true
    window.history.replaceState({}, '', removeInviteParam(currentUrl))

    if (pubkey === inviterPk) return

    setInviterPubkey(inviterPk)
    setInviteMode(pubkey ? 'existing-account' : 'signup')
    setShowWelcomeFlow(true)
  }, [isInitialized, pubkey])

  return (
    <>
      {nostr && showWelcomeFlow && inviterPubkey && inviteMode === 'signup' && (
        <InviteWelcomeFlow
          open={showWelcomeFlow}
          onClose={() => setShowWelcomeFlow(false)}
          inviterPubkey={inviterPubkey}
        />
      )}
      {nostr && showWelcomeFlow && inviterPubkey && inviteMode === 'existing-account' && (
        <InviteWelcomeDialog
          open={showWelcomeFlow}
          onClose={() => setShowWelcomeFlow(false)}
          inviterPubkey={inviterPubkey}
        />
      )}
    </>
  )
}
