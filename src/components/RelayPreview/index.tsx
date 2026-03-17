import { useSecondaryPage } from '@/PageManager'
import { useFetchRelayInfos } from '@/hooks'
import { toRelay } from '@/lib/link'
import { getRelayDisplayName } from '@/lib/relay'
import { normalizeUrl, simplifyUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { TRelayInfo } from '@/types'
import { Server } from 'lucide-react'
import { useMemo } from 'react'
import { Card } from '../ui/card'

export default function RelayPreview({
  urls,
  className
}: {
  urls: string[]
  className?: string
}) {
  const normalizedUrls = useMemo(() => {
    const seen = new Set<string>()
    const uniqueUrls: string[] = []

    urls.forEach((url) => {
      const normalizedUrl = normalizeUrl(url) || url
      if (seen.has(normalizedUrl)) {
        return
      }
      seen.add(normalizedUrl)
      uniqueUrls.push(normalizedUrl)
    })

    return uniqueUrls
  }, [urls])
  const { relayInfos } = useFetchRelayInfos(normalizedUrls)

  if (normalizedUrls.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {normalizedUrls.map((url, index) => (
        <RelayPreviewCard key={url} url={url} relayInfo={relayInfos[index]} />
      ))}
    </div>
  )
}

function RelayPreviewCard({ url, relayInfo }: { url: string; relayInfo?: TRelayInfo }) {
  const { push } = useSecondaryPage()
  const displayName = relayInfo ? getRelayDisplayName(relayInfo) : simplifyUrl(url)
  const shortUrl = relayInfo?.shortUrl || simplifyUrl(url)

  return (
    <Card
      className="cursor-pointer overflow-hidden p-3 whitespace-normal transition-colors hover:bg-accent/40"
      style={{ borderRadius: 'var(--media-radius, 12px)' }}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation()
        push(toRelay(url))
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        push(toRelay(url))
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Server className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {displayName}
          </div>
          {relayInfo?.description && (
            <div className="mt-0.5 line-clamp-3 text-xs text-muted-foreground sm:text-sm">
              {relayInfo.description}
            </div>
          )}
          {shortUrl !== displayName && (
            <div className="mt-1 truncate text-xs text-muted-foreground">{shortUrl}</div>
          )}
        </div>
      </div>
    </Card>
  )
}
