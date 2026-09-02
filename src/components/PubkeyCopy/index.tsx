import { formatNpub } from '@/lib/pubkey'
import { Check, Copy } from 'lucide-react'
import { nip19 } from 'nostr-tools'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function PubkeyCopy({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const npub = useMemo(() => (pubkey ? nip19.npubEncode(pubkey) : ''), [pubkey])
  const [copied, setCopied] = useState(false)

  const copyNpub = async () => {
    if (!npub) return

    try {
      await navigator.clipboard.writeText(npub)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy npub:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  return (
    <button
      type="button"
      className="flex min-h-10 w-fit items-center gap-2 rounded-full bg-muted px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => copyNpub()}
      aria-label={
        copied
          ? t('Public key copied', { defaultValue: 'Public key copied' })
          : t('Copy public key', { defaultValue: 'Copy public key' })
      }
    >
      <div>{formatNpub(npub, 24)}</div>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
