import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toScheduledPostsSettings } from '@/lib/link'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { TSignerType } from '@/types'
import dayjs from 'dayjs'
import { Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

function formatDateTimeInputValue(timestamp: number | null) {
  return timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DDTHH:mm') : ''
}

function parseDateTimeInputValue(value: string) {
  if (!value) return null

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.startOf('minute').unix() : null
}

function formatScheduledDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp * 1000)
}

export default function PostSchedulePopover({
  scheduledFor,
  onScheduledForChange,
  signerType,
  onViewQueue
}: {
  scheduledFor: number | null
  onScheduledForChange: (timestamp: number | null) => void
  signerType?: TSignerType | null
  onViewQueue?: () => void
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const [open, setOpen] = useState(false)
  const quickOptions = useMemo(() => {
    const now = dayjs()

    return [
      {
        label: t('In 30m'),
        timestamp: now.add(30, 'minute').startOf('minute').unix()
      },
      {
        label: t('In 2h'),
        timestamp: now.add(2, 'hour').startOf('minute').unix()
      },
      {
        label: t('Tomorrow 9AM'),
        timestamp: now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0).unix()
      }
    ]
  }, [t])
  const minValue = dayjs().add(1, 'minute').startOf('minute').format('YYYY-MM-DDTHH:mm')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title={scheduledFor ? t('Edit scheduled time') : t('Schedule post')}
          className={cn(
            'bg-foreground/5 hover:bg-foreground/10',
            scheduledFor && 'bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary'
          )}
        >
          <Clock />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">{t('Schedule post')}</div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              'Scheduled notes publish locally from this browser when this account is active. If x21 is closed, they send the next time you reopen it.'
            )}
          </p>
        </div>

        <Input
          type="datetime-local"
          min={minValue}
          value={formatDateTimeInputValue(scheduledFor)}
          onChange={(event) => onScheduledForChange(parseDateTimeInputValue(event.target.value))}
        />

        <div className="flex flex-wrap gap-2">
          {quickOptions.map((option) => (
            <Button
              key={option.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onScheduledForChange(option.timestamp)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {scheduledFor && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('Scheduled for {{time}}', {
              time: formatScheduledDateTime(scheduledFor)
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-0 text-xs text-muted-foreground"
              onClick={() => {
                setOpen(false)
                window.setTimeout(() => {
                  if (onViewQueue) {
                    onViewQueue()
                    return
                  }
                  push(toScheduledPostsSettings())
                }, 0)
              }}
            >
              {t('View queue', { defaultValue: 'View queue' })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-0 text-xs text-muted-foreground"
              onClick={() => onScheduledForChange(null)}
              disabled={!scheduledFor}
            >
              {t('Clear')}
            </Button>
          </div>
          {signerType === 'nip-07' && (
            <p className="text-right text-[11px] leading-4 text-muted-foreground">
              {t('Your signer may still ask you to approve when it is time to send.')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
