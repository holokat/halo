import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { applyLocalSpamMarkForReport } from '@/lib/report-spam'
import {
  createReportDraftEvent,
  NIP56_REPORT_TYPES,
  type TNip56ReportType
} from '@/lib/draft-event'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useSpamFilter } from '@/providers/SpamFilterProvider'
import {
  Bug,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  TriangleAlert,
  UserX
} from 'lucide-react'
import { NostrEvent, kinds } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type ReportReasonOption = {
  value: TNip56ReportType
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const REPORT_REASON_OPTIONS: ReportReasonOption[] = [
  {
    value: 'nudity',
    title: 'Nudity',
    description: 'Depictions of nudity or sexual content.',
    icon: TriangleAlert
  },
  {
    value: 'malware',
    title: 'Malware',
    description: 'Suspicious software, phishing, or harmful links/files.',
    icon: Bug
  },
  {
    value: 'profanity',
    title: 'Profanity',
    description: 'Abusive, hateful, or excessively offensive language.',
    icon: MessageSquare
  },
  {
    value: 'illegal',
    title: 'Illegal content',
    description: 'Content that may be illegal in some jurisdictions.',
    icon: ShieldAlert
  },
  {
    value: 'spam',
    title: 'Spam',
    description: 'Unwanted promotions, repetitive posts, or manipulation.',
    icon: TriangleAlert
  },
  {
    value: 'impersonation',
    title: 'Impersonation',
    description: 'Someone pretending to be another person or brand.',
    icon: UserX
  },
  {
    value: 'other',
    title: 'Other',
    description: 'Anything not covered by the categories above.',
    icon: MessageSquare
  }
]

export default function ReportDialog({
  event,
  isOpen,
  closeDialog
}: {
  event: NostrEvent
  isOpen: boolean
  closeDialog: () => void
}) {
  const { isSmallScreen } = useScreenSize()
  const { t } = useTranslation()

  if (isSmallScreen) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog()
          }
        }}
      >
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle>{t('Report content', { defaultValue: 'Report content' })}</DrawerTitle>
            <DrawerDescription>
              {t('Choose a reason and submit a NIP-56 report (kind 1984).', {
                defaultValue: 'Choose a reason and submit a NIP-56 report (kind 1984).'
              })}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-5">
            <ReportContent event={event} closeDialog={closeDialog} isOpen={isOpen} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialog()
        }
      }}
    >
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle>{t('Report content', { defaultValue: 'Report content' })}</DialogTitle>
          <DialogDescription>
            {t('Choose a reason and submit a NIP-56 report (kind 1984).', {
              defaultValue: 'Choose a reason and submit a NIP-56 report (kind 1984).'
            })}
          </DialogDescription>
        </DialogHeader>
        <ReportContent
          event={event}
          closeDialog={closeDialog}
          isOpen={isOpen}
          className="px-6 pb-6"
        />
      </DialogContent>
    </Dialog>
  )
}

function ReportContent({
  event,
  closeDialog,
  isOpen,
  className
}: {
  event: NostrEvent
  closeDialog: () => void
  isOpen: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const { pubkey, publish } = useNostr()
  const { markSpam } = useSpamFilter()
  const [reason, setReason] = useState<TNip56ReportType | null>(null)
  const [details, setDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [didMarkSpam, setDidMarkSpam] = useState(false)

  const availableReasons = useMemo(() => {
    if (event.kind !== kinds.Metadata) return REPORT_REASON_OPTIONS

    // For profile reports, put impersonation at the top while still exposing all NIP-56 reasons.
    return [
      REPORT_REASON_OPTIONS.find((item) => item.value === 'impersonation')!,
      ...REPORT_REASON_OPTIONS.filter((item) => item.value !== 'impersonation')
    ]
  }, [event.kind])

  const selectedReason = useMemo(
    () => availableReasons.find((option) => option.value === reason),
    [availableReasons, reason]
  )

  useEffect(() => {
    if (!isOpen) return
    setReason(null)
    setDetails('')
    setReporting(false)
    setIsSubmitted(false)
    setDidMarkSpam(false)
  }, [isOpen])

  const handleReport = async () => {
    if (!reason || !pubkey) return

    try {
      setReporting(true)
      const draftEvent = createReportDraftEvent(event, reason, details)
      await publish(draftEvent)
      const didMark =
        event.pubkey !== pubkey && applyLocalSpamMarkForReport(reason, event.pubkey, markSpam)
      setDidMarkSpam(didMark)
      setIsSubmitted(true)
      toast.success(
        didMark
          ? t('Report sent and author marked as spam', {
              defaultValue: 'Report sent and author marked as spam'
            })
          : t('Report sent', { defaultValue: 'Report sent' })
      )
    } catch (error) {
      toast.error(
        t('Failed to send report', { defaultValue: 'Failed to send report' }) +
          ': ' +
          (error as Error).message
      )
    } finally {
      setReporting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className={cn('space-y-4 pt-4', className)}>
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-500" />
          <div className="text-lg font-semibold">
            {t('Report sent', { defaultValue: 'Report sent' })}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {didMarkSpam
              ? t('The report was published. Content from this author is now hidden.', {
                  defaultValue: 'The report was published. Content from this author is now hidden.'
                })
              : t('Your moderation report has been published as kind 1984.', {
                  defaultValue: 'Your moderation report has been published as kind 1984.'
                })}
          </p>
          {selectedReason && (
            <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t('Reason', { defaultValue: 'Reason' })}:{' '}
              {t(selectedReason.title, { defaultValue: selectedReason.title })}
            </p>
          )}
        </div>
        <Button
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            closeDialog()
          }}
        >
          {t('Done', { defaultValue: 'Done' })}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('w-full space-y-4 pt-4', className)}>
      <div className="rounded-2xl border border-border/60 bg-muted/40 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          NIP-56
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Reports are public moderation signals. Include only details needed for review.', {
            defaultValue:
              'Reports are public moderation signals. Include only details needed for review.'
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t('Reason for report', { defaultValue: 'Reason for report' })}
        </Label>
        <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {availableReasons.map((option) => {
            const Icon = option.icon
            const selected = option.value === reason
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'w-full rounded-2xl border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40'
                    : 'border-border/70 bg-background hover:bg-muted/50'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  setReason(option.value)
                }}
                aria-pressed={selected}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 rounded-full p-2',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight">
                      {t(option.title, { defaultValue: option.title })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(option.description, { defaultValue: option.description })}
                    </p>
                  </div>
                  {selected && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-details" className="text-sm font-medium">
          {t('Additional details (optional)', {
            defaultValue: 'Additional details (optional)'
          })}
        </Label>
        <Textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={500}
          placeholder={t('Add context that helps moderators understand the report.', {
            defaultValue: 'Add context that helps moderators understand the report.'
          })}
          className="min-h-24 rounded-2xl"
        />
        <div className="text-right text-xs text-muted-foreground">{details.length}/500</div>
      </div>

      {!pubkey && (
        <p className="text-sm text-destructive">
          {t('You need to be logged in to send a report.', {
            defaultValue: 'You need to be logged in to send a report.'
          })}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation()
            closeDialog()
          }}
          disabled={reporting}
        >
          {t('Cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={!reason || reporting || !pubkey || !NIP56_REPORT_TYPES.includes(reason)}
          onClick={(e) => {
            e.stopPropagation()
            handleReport()
          }}
        >
          {reporting ? <Loader2 className="animate-spin" /> : <Send />}
          {reporting
            ? t('Sending report...', { defaultValue: 'Sending report...' })
            : t('Send report', { defaultValue: 'Send report' })}
        </Button>
      </div>
    </div>
  )
}
