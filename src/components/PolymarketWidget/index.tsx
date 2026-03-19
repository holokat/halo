import Image from '@/components/Image'
import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import polymarketService, {
  TPolymarketCategory,
  TPolymarketMarket,
  TPolymarketWidgetPayload
} from '@/services/polymarket.service'
import { BarChart3, EyeOff, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const REFRESH_INTERVAL_MS = 2 * 60 * 1000
const DISPLAY_COUNT = 8
const WIDGET_LIST_HEIGHT_CLASS = 'max-h-[232px]'

export default function PolymarketWidget() {
  const { t } = useTranslation()
  const { toggleWidget, hideWidgetTitles, isWidgetCollapsed } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)
  const [payload, setPayload] = useState<TPolymarketWidgetPayload | null>(() =>
    polymarketService.peekWidgetData()
  )
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(() => !polymarketService.peekWidgetData())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)

  const widgetName =
    AVAILABLE_WIDGETS.find((widget) => widget.id === 'polymarket')?.name || 'Polymarket'
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('polymarket')

  const fetchMarkets = useCallback(async ({ showSkeleton = false, force = false } = {}) => {
    const requestId = ++latestRequestIdRef.current

    if (showSkeleton) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const nextPayload = await polymarketService.getWidgetData({ force })
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) return

      setPayload(nextPayload)
      setError(null)
    } catch (nextError) {
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) return

      setError(
        nextError instanceof Error && nextError.message.trim()
          ? nextError.message
          : 'Failed to load Polymarket markets'
      )
    } finally {
      if (isMountedRef.current && requestId === latestRequestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void fetchMarkets({ showSkeleton: !payload })
    const interval = window.setInterval(() => {
      void fetchMarkets({ force: true })
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [fetchMarkets, payload])

  const categories = useMemo<TPolymarketCategory[]>(() => {
    if (!payload?.categories.length) {
      return [{ slug: 'all', label: t('All', { defaultValue: 'All' }) }]
    }

    return payload.categories.map((category) =>
      category.slug === 'all'
        ? { ...category, label: t('All', { defaultValue: 'All' }) }
        : category
    )
  }, [payload, t])

  useEffect(() => {
    if (!categories.some((category) => category.slug === selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [categories, selectedCategory])

  const filteredMarkets = useMemo(() => {
    const markets = payload?.markets ?? []

    return markets
      .filter((market) =>
        selectedCategory === 'all' ? true : market.categorySlugs.includes(selectedCategory)
      )
      .slice(0, DISPLAY_COUNT)
  }, [payload, selectedCategory])

  return (
    <WidgetContainer className="flex flex-col">
      <WidgetHeader
        widgetId="polymarket"
        title={widgetName}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        titleActions={
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
            onClick={() => void fetchMarkets({ force: true })}
            title={t('Refresh markets', { defaultValue: 'Refresh markets' })}
            aria-label={t('Refresh markets', { defaultValue: 'Refresh markets' })}
            disabled={loading || refreshing}
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', (loading || refreshing) && 'animate-spin')} />
          </button>
        }
        actions={
          isHovered ? (
            <button
              type="button"
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => toggleWidget('polymarket')}
              title={t('Hide widget', { defaultValue: 'Hide widget' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />

      {!isCollapsed && (
        <div className={cn('px-4 pb-4', hideWidgetTitles && 'pt-4')}>
          <div className="pt-1">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger
                className="h-8 text-xs"
                aria-label={t('Choose Polymarket category', {
                  defaultValue: 'Choose Polymarket category'
                })}
              >
                <SelectValue placeholder={t('All', { defaultValue: 'All' })} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.slug} value={category.slug}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={cn(
              WIDGET_LIST_HEIGHT_CLASS,
              'mt-3 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y scrollbar-hide'
            )}
          >
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border/70 p-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-4/5" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <EmptyState
                text={t('Polymarket data is unavailable right now.', {
                  defaultValue: 'Polymarket data is unavailable right now.'
                })}
                subtext={error}
              />
            ) : filteredMarkets.length === 0 ? (
              <EmptyState
                text={t('No active predictions in this category right now.', {
                  defaultValue: 'No active predictions in this category right now.'
                })}
              />
            ) : (
              <div className="space-y-2">
                {filteredMarkets.map((market) => (
                  <PolymarketRow key={market.id} market={market} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetContainer>
  )
}

function PolymarketRow({ market }: { market: TPolymarketMarket }) {
  const has24hVolume = market.volume24hr !== null && market.volume24hr > 0
  const hasTotalVolume = market.volume !== null && market.volume > 0

  return (
    <a
      href={market.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-border/70 bg-background/40 p-2 transition-colors hover:bg-accent/30"
    >
      <div className="flex items-center gap-2">
        {market.image ? (
          <Image
            image={{ url: market.image }}
            alt={market.question}
            className="h-full w-full object-cover"
            classNames={{ wrapper: 'h-11 w-11 shrink-0 rounded-md border bg-muted/30' }}
            hideIfError
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-muted/20 text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 line-clamp-2 text-[12px] font-medium leading-tight">
              {market.question}
            </p>
            {market.leadingOutcomeProbability !== null && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {formatProbability(market.leadingOutcomeProbability)}
                {market.leadingOutcomeLabel ? ` ${truncateOutcomeLabel(market.leadingOutcomeLabel)}` : ''}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            {market.primaryCategory && <span>{market.primaryCategory}</span>}
            {has24hVolume && <span>24h {formatCompactUsd(market.volume24hr!)}</span>}
            {!has24hVolume && hasTotalVolume && (
              <span>{formatCompactUsd(market.volume!)} vol</span>
            )}
            {market.endDate && <span>{formatEndDate(market.endDate)}</span>}
          </div>
        </div>
      </div>
    </a>
  )
}

function EmptyState({ text, subtext }: { text: string; subtext?: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
      <p>{text}</p>
      {subtext ? <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">{subtext}</p> : null}
    </div>
  )
}

function formatProbability(value: number) {
  return `${Math.round(value * 100)}%`
}

function truncateOutcomeLabel(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

function formatCompactUsd(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value)
}

function formatEndDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `Ends ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  })}`
}
