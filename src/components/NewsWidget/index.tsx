import WidgetContainer from '@/components/WidgetContainer'
import Image from '@/components/Image'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { URL_REGEX } from '@/constants'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import webService from '@/services/web.service'
import { TWebMetadata } from '@/types'
import { EyeOff, Newspaper } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const NEWS_LIMIT = 40
const DISPLAY_COUNT = 18
const REFRESH_INTERVAL_MS = 2 * 60 * 1000
const WIDGET_HEIGHT_CLASS = 'max-h-[320px]'

export default function NewsWidget() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { shouldAutoLoadMedia } = useContentPolicy()
  const { isEventDeleted } = useDeletedEvent()
  const { mutePubkeySet } = useMuteList()
  const { hideUntrustedNotes, isUserTrusted } = useUserTrust()
  const { toggleWidget, hideWidgetTitles, newsWidgetRelays } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  const widgetName = AVAILABLE_WIDGETS.find((widget) => widget.id === 'news')?.name || 'News'

  useEffect(() => {
    let isActive = true

    const fetchNews = async () => {
      if (newsWidgetRelays.length === 0) {
        if (isActive) {
          setEvents([])
          setLoading(false)
        }
        return
      }

      if (isActive) {
        setLoading(true)
      }

      try {
        const fetchedEvents = await client.fetchEvents(newsWidgetRelays, {
          kinds: [1],
          limit: NEWS_LIMIT
        })

        if (!isActive) return

        setEvents(fetchedEvents.slice().sort((a, b) => b.created_at - a.created_at))
      } catch (error) {
        console.error('Failed to fetch news widget events:', error)
        if (isActive) {
          setEvents([])
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    fetchNews()
    const interval = window.setInterval(fetchNews, REFRESH_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(interval)
    }
  }, [newsWidgetRelays])

  const visibleEvents = useMemo(() => {
    const idSet = new Set<string>()
    const articleUrlSet = new Set<string>()

    return events.filter((event) => {
      if (isEventDeleted(event)) return false
      if (mutePubkeySet.has(event.pubkey)) return false
      if (hideUntrustedNotes && !isUserTrusted(event.pubkey)) return false
      if (idSet.has(event.id)) return false
      idSet.add(event.id)

      const articleUrl = extractArticleUrl(event.content)
      if (articleUrl) {
        if (articleUrlSet.has(articleUrl)) {
          return false
        }
        articleUrlSet.add(articleUrl)
      }

      return true
    })
  }, [events, hideUntrustedNotes, isEventDeleted, isUserTrusted, mutePubkeySet])

  const displayedEvents = useMemo(() => {
    return visibleEvents.slice(0, DISPLAY_COUNT)
  }, [visibleEvents])

  return (
    <WidgetContainer className="flex flex-col">
      {!hideWidgetTitles && (
        <CardHeader
          className="group flex flex-row items-center justify-between space-y-0 border-b p-4 pb-3"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <CardTitle className="font-semibold" style={{ fontSize: '14px' }}>
            {widgetName}
          </CardTitle>
          {isHovered && (
            <button
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => toggleWidget('news')}
              title={t('Hide widget', { defaultValue: 'Hide widget' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
        </CardHeader>
      )}

      <div
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
              <button
                key={event.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent/50"
                onClick={() => push(toNote(event.id))}
              >
                <NewsThumbnail
                  url={extractArticleUrl(event.content)}
                  canAutoLoad={shouldAutoLoadMedia(event.pubkey)}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight">
                  {getHeadline(event.content)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}

function NewsThumbnail({ url, canAutoLoad }: { url?: string; canAutoLoad: boolean }) {
  const metadata = useNewsMetadata(url)

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

function extractArticleUrl(content: string) {
  return content.match(createUrlRegex())?.[0]
}

function getHeadline(content: string) {
  const cleaned = content.replace(createUrlRegex(), '').replace(/\s+/g, ' ').trim()
  return cleaned || content.replace(/\s+/g, ' ').trim()
}

function createUrlRegex() {
  return new RegExp(URL_REGEX.source, URL_REGEX.flags)
}
