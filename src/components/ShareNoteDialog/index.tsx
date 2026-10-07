import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { toNoteUrl } from '@/lib/link'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { IconCheckmark1 as Check } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCheckmark1'
import { IconSquareBehindSquare1 as Copy } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSquareBehindSquare1'
import { IconShareAndroid as Share2 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconShareAndroid'
import { type Event } from 'nostr-tools'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function ShareNoteDialog({
  event,
  open,
  onOpenChange
}: {
  event: Event
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const [copied, setCopied] = useState(false)
  const shareUrl = useMemo(() => toNoteUrl(event), [event])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success(t('Link copied', { defaultValue: 'Link copied' }))
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error('Failed to copy share link:', error)
      toast.error(t('Failed to copy'))
    }
  }

  const share = async () => {
    if (!navigator.share) {
      await copyLink()
      return
    }

    try {
      await navigator.share({ title: t('Halo note'), url: shareUrl })
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        console.error('Failed to share note:', error)
        toast.error(t('Failed to share', { defaultValue: 'Failed to share' }))
      }
    }
  }

  const content = (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t('Share note', { defaultValue: 'Share note' })}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('Send a link that opens this note in any browser.', {
            defaultValue: 'Send a link that opens this note in any browser.'
          })}
        </p>
      </div>

      <Input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Copy />}
          {copied ? t('Copied!') : t('Copy link')}
        </Button>
        <Button onClick={() => void share()}>
          <Share2 />
          {t('Share')}
        </Button>
      </div>
    </div>
  )

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle className="sr-only">
            {t('Share note', { defaultValue: 'Share note' })}
          </DrawerTitle>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent withoutClose className="max-w-md p-0">
        <DialogTitle className="sr-only">
          {t('Share note', { defaultValue: 'Share note' })}
        </DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  )
}
