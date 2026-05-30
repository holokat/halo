import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { cn } from '@/lib/utils'
import { useOptionalNostr } from '@/providers/NostrProvider'
import scheduledPostsService, {
  getScheduledPostRetryDelaySeconds,
  scheduledPostsChangedEventName,
  TScheduledPost
} from '@/services/scheduled-posts.service'
import dayjs from 'dayjs'
import { CalendarClock, CircleAlert, Clock3, RefreshCcw, Trash2 } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const CLOCK_REFRESH_INTERVAL_MS = 15_000

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp * 1000)
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return '<1m'
}

function truncateText(value: string, maxLength = 180) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trimEnd()}…`
}

const ScheduledPostsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const nostr = useOptionalNostr()
  const account = nostr?.account ?? null
  const [items, setItems] = useState<TScheduledPost[]>([])
  const [now, setNow] = useState(() => dayjs().unix())
  const [refreshing, setRefreshing] = useState(false)
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())
  const [cancellingAll, setCancellingAll] = useState(false)

  const refresh = useCallback(() => {
    setItems(scheduledPostsService.getScheduledPosts())
  }, [])

  useEffect(() => {
    refresh()

    const handleChange = () => refresh()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    window.addEventListener(scheduledPostsChangedEventName, handleChange)
    window.addEventListener('focus', handleChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener(scheduledPostsChangedEventName, handleChange)
      window.removeEventListener('focus', handleChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(dayjs().unix())
    }, CLOCK_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const queue = useMemo(() => {
    if (!account?.pubkey) return []
    return items.filter((item) => item.accountPubkey === account.pubkey)
  }, [account?.pubkey, items])

  const handleManualRefresh = useCallback(() => {
    setRefreshing(true)
    refresh()
    window.setTimeout(() => setRefreshing(false), 300)
  }, [refresh])

  const handleCancel = useCallback(
    (item: TScheduledPost) => {
      setCancellingIds((prev) => new Set(prev).add(item.id))
      try {
        scheduledPostsService.removeScheduledPost(item.id)
        toast.success(
          t('Scheduled note cancelled', {
            defaultValue: 'Scheduled note cancelled'
          })
        )
      } finally {
        setCancellingIds((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }
    },
    [t]
  )

  const handleCancelAll = useCallback(() => {
    if (!account?.pubkey || queue.length === 0) return

    setCancellingAll(true)
    try {
      scheduledPostsService.removeScheduledPostsForAccount(account.pubkey)
      toast.success(
        t('Cancelled {{count}} scheduled notes', {
          count: queue.length,
          defaultValue: 'Cancelled {{count}} scheduled notes'
        })
      )
    } finally {
      setCancellingAll(false)
    }
  }, [account?.pubkey, queue.length, t])

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={t('Scheduled posts', { defaultValue: 'Scheduled posts' })}
      controls={
        <Button
          variant="ghost"
          size="titlebar-icon"
          onClick={handleManualRefresh}
          title={t('Refresh', { defaultValue: 'Refresh' })}
        >
          <RefreshCcw className={cn(refreshing && 'animate-spin')} />
        </Button>
      }
    >
      <div className="space-y-3 px-4 pt-3">
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t(
            'Scheduled notes are sent from this browser while this account is active. If Halo is closed, notes will send next time it is opened.',
            {
              defaultValue:
                'Scheduled notes are sent from this browser while this account is active. If Halo is closed, notes will send next time it is opened.'
            }
          )}
        </div>

        {!account?.pubkey ? (
          <div className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
            {t('Log in with a signing account to manage scheduled notes.', {
              defaultValue: 'Log in with a signing account to manage scheduled notes.'
            })}
          </div>
        ) : queue.length === 0 ? (
          <div className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
            {t('No scheduled notes for this account.', {
              defaultValue: 'No scheduled notes for this account.'
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
              <div>
                {t('{{count}} note(s) in queue', {
                  count: queue.length,
                  defaultValue: '{{count}} note(s) in queue'
                })}
              </div>
              <Button
                variant="ghost-destructive"
                size="sm"
                className="h-7"
                disabled={cancellingAll || queue.length === 0}
                onClick={handleCancelAll}
              >
                <Trash2 className="size-3.5" />
                {t('Cancel all', { defaultValue: 'Cancel all' })}
              </Button>
            </div>

            <div className="space-y-2">
              {queue.map((item) => {
                const retryAt = item.lastAttemptAt
                  ? item.lastAttemptAt + getScheduledPostRetryDelaySeconds(item.attempts)
                  : null
                const hasRetry = retryAt !== null
                const retryPending = typeof retryAt === 'number' && retryAt > now
                const isDueNow = item.scheduledFor <= now && (!hasRetry || !retryPending)
                const preview = truncateText(item.payload.text || '')
                const hasPreview = preview.length > 0
                const timeUntilScheduled = item.scheduledFor - now
                const timeUntilRetry = typeof retryAt === 'number' ? retryAt - now : null

                return (
                  <div key={item.id} className="rounded-lg border bg-background px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px]',
                              hasRetry
                                ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : isDueNow
                                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'border-primary/25 bg-primary/10 text-primary'
                            )}
                          >
                            {hasRetry
                              ? t('Retrying', { defaultValue: 'Retrying' })
                              : isDueNow
                                ? t('Due now', { defaultValue: 'Due now' })
                                : t('Scheduled', { defaultValue: 'Scheduled' })}
                          </Badge>
                          {item.payload.isPoll && (
                            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                              {t('Poll', { defaultValue: 'Poll' })}
                            </Badge>
                          )}
                          {item.payload.parentEvent && (
                            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                              {t('Reply', { defaultValue: 'Reply' })}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-sm">
                          <CalendarClock className="size-3.5 text-muted-foreground" />
                          <span>{formatDateTime(item.scheduledFor)}</span>
                        </div>

                        {hasRetry && typeof retryAt === 'number' ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock3 className="size-3.5" />
                            {retryPending
                              ? t('Retry in {{time}}', {
                                  time: formatDuration(timeUntilRetry ?? 0),
                                  defaultValue: 'Retry in {{time}}'
                                })
                              : t('Retrying now', { defaultValue: 'Retrying now' })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock3 className="size-3.5" />
                            {timeUntilScheduled > 0
                              ? t('Publishes in {{time}}', {
                                  time: formatDuration(timeUntilScheduled),
                                  defaultValue: 'Publishes in {{time}}'
                                })
                              : t('Publishing soon', { defaultValue: 'Publishing soon' })}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={cancellingIds.has(item.id)}
                        onClick={() => handleCancel(item)}
                      >
                        <Trash2 className="size-3.5" />
                        {t('Cancel')}
                      </Button>
                    </div>

                    {hasPreview && (
                      <div className="mt-2 rounded-md border bg-muted/20 px-2.5 py-2 text-sm text-foreground/90">
                        {preview}
                      </div>
                    )}

                    {!hasPreview && item.payload.images.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t('{{count}} image(s) attached', {
                          count: item.payload.images.length,
                          defaultValue: '{{count}} image(s) attached'
                        })}
                      </div>
                    )}

                    {item.lastError && (
                      <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        <span className="line-clamp-2">{item.lastError}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </SecondaryPageLayout>
  )
})

ScheduledPostsPage.displayName = 'ScheduledPostsPage'

export default ScheduledPostsPage
