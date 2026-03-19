import RelayHealthBadge from '@/components/RelayHealthBadge'
import RelayIcon from '@/components/RelayIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNostr } from '@/providers/NostrProvider'
import inboxRelayRecommendationsService, {
  TInboxRelayRecommendation
} from '@/services/inbox-relay-recommendations.service'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  existingRelayUrls: string[]
  onAddRelay: (url: string) => void
  onAutoPickRelayUrls: (urls: string[]) => void
}

export default function InboxRelayRecommendations({
  existingRelayUrls,
  onAddRelay,
  onAutoPickRelayUrls
}: Props) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const [recommendations, setRecommendations] = useState<TInboxRelayRecommendation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pubkey) return

    let cancelled = false

    const fetchRecommendations = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const nextRecommendations = await inboxRelayRecommendationsService.getRecommendedInboxRelays(
          pubkey,
          6
        )
        if (!cancelled) {
          setRecommendations(nextRecommendations)
        }
      } catch (loadError) {
        console.error('Failed to load inbox relay recommendations:', loadError)
        if (!cancelled) {
          setError(t('Failed to load inbox relay recommendations.'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchRecommendations()

    return () => {
      cancelled = true
    }
  }, [pubkey, t])

  const filteredRecommendations = useMemo(
    () => recommendations.filter((recommendation) => !existingRelayUrls.includes(recommendation.url)),
    [existingRelayUrls, recommendations]
  )

  const autoPickRelayUrls = useMemo(
    () => recommendations.slice(0, 3).map((recommendation) => recommendation.url),
    [recommendations]
  )

  if (!pubkey) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>{t('Finding healthy inbox relays...')}</span>
      </div>
    )
  }

  if (error || recommendations.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            <span>{t('Recommended inbox relays')}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'We rank relays using NIP-66 monitor data, relay health, and the inbox relays people you follow already publish.'
            )}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full"
          disabled={autoPickRelayUrls.length === 0}
          onClick={() => onAutoPickRelayUrls(autoPickRelayUrls)}
        >
          <Sparkles className="mr-1 size-3.5" />
          {t('Use top picks')}
        </Button>
      </div>

      {filteredRecommendations.length > 0 ? (
        <div className="space-y-2">
          {filteredRecommendations.map((recommendation) => (
            <RecommendationItem
              key={recommendation.url}
              recommendation={recommendation}
              onAddRelay={onAddRelay}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
          {t('Your current inbox relays already match the healthiest recommendations.')}
        </div>
      )}
    </div>
  )
}

function RecommendationItem({
  recommendation,
  onAddRelay
}: {
  recommendation: TInboxRelayRecommendation
  onAddRelay: (url: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/80 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <RelayIcon url={recommendation.url} />
          <div className="truncate text-sm font-medium">{recommendation.url}</div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {recommendation.supportsNip17 && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
              NIP-17
            </Badge>
          )}
          {recommendation.supportsAuth && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
              AUTH
            </Badge>
          )}
          {recommendation.relayType === 'PrivateInbox' && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
              Inbox
            </Badge>
          )}
          {recommendation.followerCount > 0 && (
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
              {recommendation.followerCount}
            </Badge>
          )}
          {recommendation.reasons.slice(0, 2).map((reason) => (
            <span key={reason} className="text-[10px] text-muted-foreground">
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <RelayHealthBadge url={recommendation.url} result={recommendation.health} />
        <Button type="button" size="icon" variant="secondary" className="size-8" onClick={() => onAddRelay(recommendation.url)}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}
