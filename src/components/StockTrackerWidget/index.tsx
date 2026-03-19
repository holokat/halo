import { SecondaryPageLink } from '@/PageManager'
import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toNoteList } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import {
  isValidStockSymbol,
  normalizeStockSymbol
} from '@/services/stock-quote.service'
import stockQuoteService from '@/services/stock-quote.service'
import { TStockQuote } from '@/types'
import { EyeOff, Plus, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type TStockTrackerQuoteState =
  | { status: 'loading' }
  | { status: 'success'; quote: TStockQuote }
  | { status: 'error'; error: string }

export default function StockTrackerWidget() {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const {
    toggleWidget,
    hideWidgetTitles,
    isWidgetCollapsed,
    stockTrackerSymbols,
    addStockTrackerSymbol,
    removeStockTrackerSymbol
  } = useWidgets()
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)

  const widgetName =
    AVAILABLE_WIDGETS.find((widget) => widget.id === 'stock-tracker')?.name || 'Stock Tracker'
  const isInputMuted = !isSmallScreen && !inputValue.trim() && !error
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('stock-tracker')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const symbol = normalizeStockSymbol(inputValue)
    if (!isValidStockSymbol(symbol)) {
      setError(
        t('Enter a valid stock symbol like $TSLA', {
          defaultValue: 'Enter a valid stock symbol like $TSLA'
        })
      )
      return
    }

    if (stockTrackerSymbols.includes(symbol)) {
      setError(
        t('Already tracking {{symbol}}', {
          defaultValue: 'Already tracking {{symbol}}',
          symbol: `$${symbol}`
        })
      )
      return
    }

    addStockTrackerSymbol(symbol)
    setInputValue('')
    setError(null)
  }

  return (
    <WidgetContainer className="flex flex-col">
      <WidgetHeader
        widgetId="stock-tracker"
        title={widgetName}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        actions={
          isHovered ? (
            <button
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => toggleWidget('stock-tracker')}
              title={t('Hide widget', { defaultValue: 'Hide widget' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />

      {!isCollapsed && (
        <div className={cn('space-y-3 p-4', hideWidgetTitles && 'pt-4')}>
          {stockTrackerSymbols.length ? (
            <div className="divide-y divide-border/70">
              {stockTrackerSymbols.map((symbol) => (
                <StockTrackerRow
                  key={symbol}
                  symbol={symbol}
                  onRemove={() => removeStockTrackerSymbol(symbol)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {t('Add a symbol to start tracking it here.', {
                defaultValue: 'Add a symbol to start tracking it here.'
              })}
            </div>
          )}

          <div
            className={cn(
              'transition-opacity duration-200',
              isInputMuted && 'opacity-20 hover:opacity-60 focus-within:opacity-100'
            )}
          >
            <form className="flex items-center gap-2" onSubmit={handleSubmit}>
              <Input
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value)
                  if (error) {
                    setError(null)
                  }
                }}
                placeholder="$TSLA"
                aria-label={t('Add stock symbol', { defaultValue: 'Add stock symbol' })}
                className="h-9"
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      )}
    </WidgetContainer>
  )
}

function StockTrackerRow({
  symbol,
  onRemove
}: {
  symbol: string
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<TStockTrackerQuoteState>(() => {
    const cachedQuote = stockQuoteService.peekQuote(symbol)
    return cachedQuote ? { status: 'success', quote: cachedQuote } : { status: 'loading' }
  })
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const cachedQuote = stockQuoteService.peekQuote(symbol)
    setState(cachedQuote ? { status: 'success', quote: cachedQuote } : { status: 'loading' })

    stockQuoteService
      .getQuote(symbol)
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
  }, [symbol])

  const quote = state.status === 'success' ? state.quote : null
  const isPositive = (quote?.change ?? 0) > 0
  const isNegative = (quote?.change ?? 0) < 0

  return (
    <div className="flex items-center gap-2 py-3">
      <SecondaryPageLink
        to={toNoteList({ stockSymbol: symbol })}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-none">${symbol}</div>
          </div>

          <div className="shrink-0 text-right">
            {state.status === 'loading' ? (
              <div className="space-y-1">
                <Skeleton className="ml-auto h-3 w-16" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
            ) : state.status === 'error' ? (
              <div className="text-[11px] text-muted-foreground">
                {t('No quote', { defaultValue: 'No quote' })}
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold leading-none">
                  {formatCompactPrice(quote?.price ?? null)}
                </div>
                <div
                  className={cn(
                    'mt-1 text-[11px] font-medium',
                    isPositive && 'text-emerald-600 dark:text-emerald-400',
                    isNegative && 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatCompactPercent(quote?.changePercent ?? null)}
                </div>
              </>
            )}
          </div>
        </div>
      </SecondaryPageLink>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
        title={t('Remove symbol', { defaultValue: 'Remove symbol' })}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function formatCompactPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: value && Math.abs(value) < 1 ? 4 : 2,
    maximumFractionDigits: value && Math.abs(value) < 1 ? 4 : 2
  }).format(value)
}

function formatCompactPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value))}%`
}
