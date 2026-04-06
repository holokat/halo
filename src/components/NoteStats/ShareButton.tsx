import ShareNoteDialog from '@/components/ShareNoteDialog'
import { cn } from '@/lib/utils'
import { Send } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function ShareButton({ event }: { event: Event }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={cn(
          'flex gap-1 items-center enabled:hover:text-primary px-3 h-full text-muted-foreground'
        )}
        title={t('Share', { defaultValue: 'Share' })}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={t('Share', { defaultValue: 'Share' })}
        aria-haspopup="dialog"
      >
        <Send aria-hidden="true" />
      </button>
      <ShareNoteDialog event={event} open={open} onOpenChange={setOpen} />
    </>
  )
}
