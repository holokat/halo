import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useTextOnlyMode } from '@/providers/TextOnlyModeProvider'
import { Event, kinds } from 'nostr-tools'
import { ArrowUpRight, BookOpenText } from 'lucide-react'
import { useMemo } from 'react'
import Image from '../Image'
import { Badge } from '../ui/badge'
import { useTranslation } from 'react-i18next'

export default function LongFormArticlePreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { autoLoadMedia } = useContentPolicy()
  const { textOnlyMode } = useTextOnlyMode()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  const readingTimeMinutes = useMemo(() => {
    const wordCount = event.content.trim().split(/\s+/).filter(Boolean).length
    return Math.max(1, Math.round(wordCount / 220))
  }, [event.content])
  const publishedAt = useMemo(() => {
    const tagValue = event.tags.find(([tagName]) => tagName === 'published_at')?.[1]
    const parsedTimestamp = Number.parseInt(tagValue || '', 10)
    return Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : event.created_at
  }, [event])
  const publishedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(publishedAt * 1000))
  }, [publishedAt])
  const shouldShowImage = Boolean(metadata.image && autoLoadMedia && !textOnlyMode)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-3 sm:p-4 shadow-sm',
        className
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative space-y-3">
        {shouldShowImage && metadata.image && (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Image
              image={{ url: metadata.image, pubkey: event.pubkey }}
              className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              hideIfError
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-6 rounded-full border-border/70 bg-background/80 px-2.5 py-0 text-[10px] uppercase tracking-[0.08em] text-foreground/80"
          >
            <BookOpenText className="mr-1 size-3" />
            {t('Article')}
          </Badge>
          <span className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-xs text-muted-foreground">
            {t('Read time: {{minutes}} min', {
              minutes: readingTimeMinutes,
              defaultValue: `Read time: ${readingTimeMinutes} min`
            })}
          </span>
          <span className="text-xs text-muted-foreground">{publishedAtLabel}</span>
        </div>
        <div className="space-y-1.5">
          <div className="text-lg font-semibold leading-tight tracking-tight text-foreground line-clamp-3 sm:text-xl">
            {metadata.title}
          </div>
          {metadata.summary && (
            <div className="text-sm leading-relaxed text-muted-foreground line-clamp-4">
              {metadata.summary}
            </div>
          )}
        </div>
        {metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metadata.tags.map((tag) => (
              <div
                key={tag}
                className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  push(toNoteList({ hashtag: tag, kinds: [kinds.LongFormArticle] }))
                }}
              >
                #<span className="truncate max-w-28">{tag}</span>
              </div>
            ))}
          </div>
        )}
        <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <span>{t('Read article', { defaultValue: 'Read article' })}</span>
          <ArrowUpRight className="size-4" />
        </div>
      </div>
    </div>
  )
}
