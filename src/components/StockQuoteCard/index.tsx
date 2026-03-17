import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import stockQuoteService from '@/services/stock-quote.service'
import { TStockQuote } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type TStockQuoteState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; quote: TStockQuote }
  | { status: 'error'; error: string }

export default function StockQuoteCard({
  symbol,
  enabled = true,
  variant = 'feed',
  className
}: {
  symbol: string
  enabled?: boolean
  variant?: 'feed' | 'hover'
  className?: string
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<TStockQuoteState>({ status: 'idle' })
  const requestIdRef = useRef(0)
  const normalizedSymbol = useMemo(() => symbol.replace(/^\$/, '').trim().toUpperCase(), [symbol])

  useEffect(() => {
    requestIdRef.current += 1
    setState({ status: 'idle' })
  }, [normalizedSymbol])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const requestId = ++requestIdRef.current
    setState((current) =>
      current.status === 'success' && current.quote.symbol === normalizedSymbol
        ? current
        : { status: 'loading' }
    )

    stockQuoteService
      .getQuote(normalizedSymbol)
      .then((quote) => {
        if (requestIdRef.current === requestId) {
          setState({ status: 'success', quote })
        }
      })
      .catch((error) => {
        if (requestIdRef.current === requestId) {
          setState({
            status: 'error',
            error:
              error instanceof Error && error.message.trim()
                ? error.message
                : 'Stock data unavailable'
          })
        }
      })
  }, [enabled, normalizedSymbol])

  const quote = state.status === 'success' ? state.quote : null
  const isPositive = (quote?.change ?? 0) > 0
  const isNegative = (quote?.change ?? 0) < 0
  const content = (
    <>
      <div
        className={cn(
          'border-b px-4 py-3',
          variant === 'feed'
            ? 'bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_38%),linear-gradient(180deg,rgba(250,250,250,0.92),rgba(245,245,245,0.96))] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_38%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(15,15,18,0.98))]'
            : 'bg-muted/40'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold leading-none">${normalizedSymbol}</div>
            {quote?.latestTradingDay ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {t('Latest trading day', { defaultValue: 'Latest trading day' })}:{' '}
                {formatTradingDay(quote.latestTradingDay)}
              </div>
            ) : null}
          </div>
          {quote ? (
            <div className="text-right">
              <div className="text-2xl font-semibold leading-none">{formatDecimal(quote.price)}</div>
              <div
                className={cn(
                  'mt-1 text-sm font-medium',
                  isPositive && 'text-emerald-600 dark:text-emerald-400',
                  isNegative && 'text-red-600 dark:text-red-400'
                )}
              >
                {formatSignedDecimal(quote.change)}
                {quote.changePercent !== null ? ` (${formatSignedPercent(quote.changePercent)})` : ''}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <LoadingState />
      ) : state.status === 'error' ? (
        <ErrorState error={state.error} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 py-3">
          <StockStat
            label={t('Open', { defaultValue: 'Open' })}
            value={formatDecimal(quote?.open ?? null)}
          />
          <StockStat
            label={t('Previous close', { defaultValue: 'Previous close' })}
            value={formatDecimal(quote?.previousClose ?? null)}
          />
          <StockStat
            label={t('High', { defaultValue: 'High' })}
            value={formatDecimal(quote?.high ?? null)}
          />
          <StockStat
            label={t('Low', { defaultValue: 'Low' })}
            value={formatDecimal(quote?.low ?? null)}
          />
          <StockStat
            label={t('Volume', { defaultValue: 'Volume' })}
            value={formatInteger(quote?.volume ?? null)}
            className="col-span-2"
          />
        </div>
      )}
    </>
  )

  if (variant === 'hover') {
    return <div className={className}>{content}</div>
  }

  return (
    <Card
      className={cn('overflow-hidden border-border/70 bg-card/95 shadow-sm backdrop-blur', className)}
      style={{
        borderRadius: 'var(--media-radius, 14px)',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0
      }}
    >
      {content}
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
      <Skeleton className="h-14 w-full" />
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="font-medium">Stock data unavailable</div>
      <div className="mt-1 text-muted-foreground">{error}</div>
    </div>
  )
}

function StockStat({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('rounded-md border bg-background/60 px-3 py-2', className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

function formatDecimal(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value && Math.abs(value) < 1 ? 4 : 2,
    maximumFractionDigits: value && Math.abs(value) < 1 ? 4 : 2
  }).format(value)
}

function formatInteger(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
  }).format(value)
}

function formatSignedDecimal(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatDecimal(Math.abs(value))}`
}

function formatSignedPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value))}%`
}

function formatTradingDay(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed)
}
