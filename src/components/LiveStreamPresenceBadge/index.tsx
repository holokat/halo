import { useLiveStreamPresence } from '@/hooks/useLiveStreamPresence'
import { getLiveStreamTitle } from '@/lib/live-stream'
import { cn } from '@/lib/utils'
import { usePrimaryPage } from '@/PageManager'
import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function LiveStreamPresenceBadge({
  pubkey,
  className,
  size = 'default'
}: {
  pubkey: string
  className?: string
  size?: 'small' | 'default'
}) {
  const { t } = useTranslation()
  const { navigate } = usePrimaryPage()
  const { event, naddr, isLive } = useLiveStreamPresence(pubkey)

  if (!isLive || !event || !naddr) return null

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-full border-2 border-background bg-red-600 text-white shadow-sm transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
        size === 'small' ? 'h-5 w-5' : 'h-6 w-6',
        className
      )}
      title={t('Open live stream')}
      aria-label={t('Open live stream')}
      onClick={(e) => {
        e.stopPropagation()
        navigate('livestreams', {
          streamToOpen: {
            naddr,
            event,
            title: getLiveStreamTitle(event, t('Live Stream')),
            openedAt: Date.now()
          }
        })
      }}
    >
      <Radio className={cn(size === 'small' ? 'size-2.5' : 'size-3')} />
    </button>
  )
}
