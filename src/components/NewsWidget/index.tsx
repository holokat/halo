import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import ResizableWidgetBody from '@/components/ResizableWidgetBody'
import Image from '@/components/Image'
import { Skeleton } from '@/components/ui/skeleton'
import { URL_REGEX } from '@/constants'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { SecondaryPageLink } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import client from '@/services/client.service'
import localStorageService from '@/services/local-storage.service'
import webService from '@/services/web.service'
import { TWebMetadata } from '@/types'
import { EyeOff, Newspaper, RefreshCcw } from 'lucide-react'
import { Event, Filter } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const NEWS_LIMIT = 40
const DISPLAY_COUNT = 18
const REFRESH_INTERVAL_MS = 2 * 60 * 1000
const WIDGET_HEIGHT_CLASS = 'max-h-[320px]'

export default function NewsWidget() {
  const { t } = useTranslation()
  const { shouldAutoLoadMedia } = useContentPolicy()
  const { isEventDeleted } = useDeletedEvent()
  const { mutePubkeySet } = useMuteList()
  const {
    toggleWidget,
    hideWidgetTitles,
    newsWidgetRelays,
    newsWidgetHashtags,
    isWidgetCollapsed
  } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [readItemKeys, setReadItemKeys] = useState<Set<string>>(() => new Set())
  const isMountedRef = useRef(true)
  const latestRequestIdRef = useRef(0)

  const widgetName = AVAILABLE_WIDGETS.find((widget) => widget.id === 'news')?.name || 'News'
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('news')

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchNews = useCallback(
    async ({ showSkeleton = false }: { showSkeleton?: boolean } = {}) => {
      const requestId = ++latestRequestIdRef.current

      const finishRequest = () => {
        if (!isMountedRef.current || requestId !== latestRequestIdRef.current) return
        setLoading(false)
        setRefreshing(false)
      }

      const updateEvents = (nextEvents: Event[]) => {
        if (!isMountedRef.current || requestId !== latestRequestIdRef.current) return
        setEvents(nextEvents)
      }

      if (newsWidgetRelays.length === 0) {
        updateEvents([])
        finishRequest()
        return
      }

      if (showSkeleton) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const filters: Filter[] = [{ kinds: [1], limit: NEWS_LIMIT }]
        if (newsWidgetHashtags.length > 0) {
          filters.push({
            kinds: [1],
            '#t': newsWidgetHashtags,
            limit: Math.max(NEWS_LIMIT, newsWidgetHashtags.length * 20)
          })
        }

        const fetchedEventGroups = await Promise.all(
          filters.map((filter) => client.fetchEvents(newsWidgetRelays, filter))
        )

        updateEvents(fetchedEventGroups.flat().sort((a, b) => b.created_at - a.created_at))
      } catch (error) {
        console.error('Failed to fetch news widget events:', error)
        updateEvents([])
      } finally {
        finishRequest()
      }
    }
    ,
    [newsWidgetHashtags, newsWidgetRelays]
  )

  useEffect(() => {
    void fetchNews({ showSkeleton: true })
    const interval = window.setInterval(() => {
      void fetchNews()
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [fetchNews])

  const visibleEvents = useMemo(() => {
    const idSet = new Set<string>()
    const articleUrlSet = new Set<string>()

    return events.filter((event) => {
      if (isEventDeleted(event)) return false
      if (mutePubkeySet.has(event.pubkey)) return false
      if (idSet.has(event.id)) return false
      idSet.add(event.id)

      const articleUrl = extractArticleUrl(event)
      if (articleUrl) {
        if (articleUrlSet.has(articleUrl)) {
          return false
        }
        articleUrlSet.add(articleUrl)
      }

      return true
    })
  }, [events, isEventDeleted, mutePubkeySet])

  const displayedEvents = useMemo(() => {
    return visibleEvents.slice(0, DISPLAY_COUNT)
  }, [visibleEvents])

  return (
    <WidgetContainer className="flex flex-col">
      <WidgetHeader
        widgetId="news"
        title={widgetName}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        titleActions={
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
            onClick={() => void fetchNews()}
            title={t('Refresh news', { defaultValue: 'Refresh news' })}
            aria-label={t('Refresh news', { defaultValue: 'Refresh news' })}
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
              onClick={() => toggleWidget('news')}
              title={t('Hide widget', { defaultValue: 'Hide widget' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />

      {!isCollapsed && (
        <ResizableWidgetBody
          widgetId="news"
          minHeight={160}
          maxHeight={720}
          className={cn(
            WIDGET_HEIGHT_CLASS,
            'overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y scrollbar-hide px-4 pb-4',
            hideWidgetTitles ? 'pt-4' : ''
          )}
        >
          {loading ? (
            <div className="space-y-2 pt-1">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2 rounded-md py-1.5">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                  <Skeleton className="h-3.5 flex-1" />
                </div>
              ))}
            </div>
          ) : newsWidgetRelays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {t('Add at least one relay in Widgets settings to populate this news feed.', {
                defaultValue: 'Add at least one relay in Widgets settings to populate this news feed.'
              })}
            </div>
          ) : displayedEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {t('No news items available right now.', {
                defaultValue: 'No news items available right now.'
              })}
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              {displayedEvents.map((event) => (
                <NewsRow
                  key={event.id}
                  event={event}
                  canAutoLoad={shouldAutoLoadMedia(event.pubkey)}
                  isRead={isNewsItemRead(event, readItemKeys)}
                  onOpenNote={(itemKey) => {
                    localStorageService.markArticleAsRead(itemKey)
                    setReadItemKeys((prev) => {
                      if (prev.has(itemKey)) return prev
                      const next = new Set(prev)
                      next.add(itemKey)
                      return next
                    })
                  }}
                />
              ))}
            </div>
          )}
        </ResizableWidgetBody>
      )}
    </WidgetContainer>
  )
}

function NewsRow({
  event,
  canAutoLoad,
  isRead,
  onOpenNote
}: {
  event: Event
  canAutoLoad: boolean
  isRead: boolean
  onOpenNote: (itemKey: string) => void
}) {
  const articleUrl = extractArticleUrl(event)
  const itemKey = getNewsItemKey(event)
  const metadata = useNewsMetadata(articleUrl)
  const headline = metadata.title?.trim() || getHeadline(event.content)
  const rowClassName =
    'flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent/50'

  return (
    <SecondaryPageLink
      as="div"
      to={toNote(event)}
      className={cn(rowClassName, isRead && 'opacity-55')}
      title={headline}
      onClick={() => onOpenNote(itemKey)}
    >
      <NewsThumbnail metadata={metadata} canAutoLoad={canAutoLoad} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight">
        {headline}
      </span>
    </SecondaryPageLink>
  )
}

function NewsThumbnail({
  metadata,
  canAutoLoad
}: {
  metadata: TWebMetadata
  canAutoLoad: boolean
}) {
  if (canAutoLoad && metadata.image) {
    return (
      <Image
        image={{ url: metadata.image }}
        className="h-8 w-8 rounded-md"
        classNames={{ wrapper: 'h-8 w-8 shrink-0 rounded-md overflow-hidden bg-muted' }}
        errorPlaceholder={<Newspaper className="h-3.5 w-3.5" />}
      />
    )
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Newspaper className="h-3.5 w-3.5" />
    </div>
  )
}

function useNewsMetadata(url?: string) {
  const [metadata, setMetadata] = useState<TWebMetadata>({})

  useEffect(() => {
    let isActive = true

    if (!url) {
      setMetadata({})
      return () => {
        isActive = false
      }
    }

    const proxyUrl = `https://proxy.shakespeare.diy/?url=${encodeURIComponent(url)}`
    webService
      .fetchWebMetadata(proxyUrl)
      .then((nextMetadata) => {
        if (isActive) {
          setMetadata(nextMetadata)
        }
      })
      .catch(() => {
        if (isActive) {
          setMetadata({})
        }
      })

    return () => {
      isActive = false
    }
  }, [url])

  return metadata
}

function extractArticleUrl(event: Event) {
  const taggedUrl = event.tags.find(
    ([tagName, tagValue]) =>
      ['r', 'url'].includes(tagName) && typeof tagValue === 'string' && /^https?:\/\//.test(tagValue)
  )?.[1]

  if (taggedUrl) {
    return taggedUrl
  }

  return event.content.match(createUrlRegex())?.[0]
}

function getNewsItemKey(event: Event) {
  return event.id
}

function isNewsItemRead(event: Event, readArticleKeys: Set<string>) {
  const articleKey = getNewsItemKey(event)
  return readArticleKeys.has(articleKey) || localStorageService.isArticleRead(articleKey)
}

function getHeadline(content: string) {
  const cleaned = content.replace(createUrlRegex(), '').replace(/\s+/g, ' ').trim()
  return cleaned || content.replace(/\s+/g, ' ').trim()
}

function createUrlRegex() {
  return new RegExp(URL_REGEX.source, URL_REGEX.flags)
}
