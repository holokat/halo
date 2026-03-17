import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import stockQuoteService from '@/services/stock-quote.service'
import { TStockQuote } from '@/types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type TStockSymbolState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; quote: TStockQuote }
  | { status: 'error'; error: string }

export function EmbeddedStockSymbol({ symbol }: { symbol: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<TStockSymbolState>({ status: 'idle' })

  useEffect(() => {
    if (!open || state.status === 'loading' || state.status === 'success') {
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    stockQuoteService
      .getQuote(symbol)
      .then((quote) => {
        if (!cancelled) {
          setState({ status: 'success', quote })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error:
              error instanceof Error && error.message.trim()
                ? error.message
                : 'Stock data unavailable'
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, state.status, symbol])

  const quote = state.status === 'success' ? state.quote : null
  const isPositive = (quote?.change ?? 0) > 0
  const isNegative = (quote?.change ?? 0) < 0

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline rounded-sm px-0.5 font-medium text-left underline decoration-dotted underline-offset-4 hover:bg-muted/60"
          onClick={(event) => event.stopPropagation()}
        >
          {symbol}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 overflow-hidden p-0">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {t('Stock', { defaultValue: 'Stock' })}
          </div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold leading-none">{symbol.replace(/^\$/, '')}</div>
              {quote?.latestTradingDay ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('Latest trading day', { defaultValue: 'Latest trading day' })}:{' '}
                  {formatTradingDay(quote.latestTradingDay)}
                </div>
              ) : null}
            </div>
            {quote ? (
              <div className="text-right">
                <div className="text-2xl font-semibold leading-none">
                  {formatDecimal(quote.price)}
                </div>
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
      </HoverCardContent>
    </HoverCard>
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
