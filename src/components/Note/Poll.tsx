import Image from '@/components/Image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { POLL_TYPE } from '@/constants'
import { useFetchPollResults } from '@/hooks/useFetchPollResults'
import { createPollResponseDraftEvent } from '@/lib/draft-event'
import { getPollMetadataFromEvent } from '@/lib/event-metadata'
import { cn, isPartiallyInViewport } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import pollResultsService from '@/services/poll-results.service'
import dayjs from 'dayjs'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function Poll({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const { pubkey, publish, startLogin } = useNostr()
  const [isVoting, setIsVoting] = useState(false)
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const pollResults = useFetchPollResults(event.id)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const poll = useMemo(() => getPollMetadataFromEvent(event), [event])
  const supportsStandardPollInteractions = poll?.format === 'nip88'
  const votedOptionIds = useMemo(() => {
    if (!pubkey) return []
    if (!pollResults) return []
    return Object.entries(pollResults.results)
      .filter(([, voters]) => voters.has(pubkey))
      .map(([optionId]) => optionId)
  }, [pollResults, pubkey])
  const validPollOptionIds = useMemo(() => poll?.options.map((option) => option.id) || [], [poll])
  const isExpired = useMemo(() => !!poll?.endsAt && dayjs().unix() > poll.endsAt, [poll])
  const isMultipleChoice = useMemo(() => poll?.pollType === POLL_TYPE.MULTIPLE_CHOICE, [poll])
  const hasVoted = votedOptionIds.length > 0
  const canVote = useMemo(
    () => supportsStandardPollInteractions && !isExpired && !votedOptionIds.length,
    [isExpired, supportsStandardPollInteractions, votedOptionIds]
  )
  const showResults = useMemo(() => {
    return supportsStandardPollInteractions && (event.pubkey === pubkey || !canVote)
  }, [supportsStandardPollInteractions, event, pubkey, canVote])
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!supportsStandardPollInteractions || pollResults || isLoadingResults || !containerElement) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            if (isPartiallyInViewport(containerElement)) {
              fetchResults()
            }
          }, 200)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(containerElement)

    return () => {
      observer.unobserve(containerElement)
    }
  }, [supportsStandardPollInteractions, pollResults, isLoadingResults, containerElement])

  if (!poll) {
    return null
  }

  const fetchResults = async () => {
    if (!supportsStandardPollInteractions) return
    setIsLoadingResults(true)
    try {
      const relays = await ensurePollRelays(event.pubkey, poll)
      return await pollResultsService.fetchResults(
        event.id,
        relays,
        validPollOptionIds,
        isMultipleChoice,
        poll.endsAt
      )
    } catch (error) {
      console.error('Failed to fetch poll results:', error)
      toast.error('Failed to fetch poll results: ' + (error as Error).message)
    } finally {
      setIsLoadingResults(false)
    }
  }

  const handleOptionClick = (optionId: string) => {
    if (isExpired) return

    if (!supportsStandardPollInteractions) return

    if (isMultipleChoice) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      )
    } else {
      setSelectedOptionIds((prev) => (prev.includes(optionId) ? [] : [optionId]))
    }
  }

  const handleVote = async () => {
    if (selectedOptionIds.length === 0) return
    if (!pubkey) {
      startLogin()
      return
    }

    setIsVoting(true)
    try {
      if (!pollResults) {
        const _pollResults = await fetchResults()
        if (_pollResults && _pollResults.voters.has(pubkey)) {
          return
        }
      }

      const additionalRelayUrls = await ensurePollRelays(event.pubkey, poll)

      const draftEvent = createPollResponseDraftEvent(event, selectedOptionIds)
      await publish(draftEvent, {
        additionalRelayUrls
      })

      setSelectedOptionIds([])
      pollResultsService.addPollResponse(event.id, pubkey, selectedOptionIds)
    } catch (error) {
      console.error('Failed to vote:', error)
      toast.error('Failed to vote: ' + (error as Error).message)
    } finally {
      setIsVoting(false)
    }
  }

  const statusBadge = isExpired
    ? {
        label: t('Ended', { defaultValue: 'Ended' }),
        className: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
      }
    : hasVoted
      ? {
          label: t('Voted', { defaultValue: 'Voted' }),
          className: 'border-primary/20 bg-primary/10 text-primary'
        }
      : canVote
        ? {
            label: t('Open', { defaultValue: 'Open' }),
            className:
              'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
          }
        : null

  return (
    <div className={className} ref={setContainerElement}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {statusBadge && (
            <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[11px]', statusBadge.className)}>
              {statusBadge.label}
            </Badge>
          )}
          {poll.pollType === POLL_TYPE.MULTIPLE_CHOICE && (
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground">
              {t('Multiple choice', { defaultValue: 'Multiple choice' })}
            </Badge>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p>{poll.pollType === POLL_TYPE.MULTIPLE_CHOICE && t('Select one or more options')}</p>
          <p>
            {!!poll.endsAt &&
              (isExpired
                ? t('Voting is closed for this poll.', {
                    defaultValue: 'Voting is closed for this poll.'
                  })
                : t('Poll ends at {{time}}', {
                    time: new Date(poll.endsAt * 1000).toLocaleString()
                  }))}
          </p>
        </div>

        {/* Poll Options */}
        <div className="grid gap-1.5">
          {poll.options.map((option) => {
            const votes = pollResults?.results?.[option.id]?.size ?? 0
            const totalVotes = pollResults?.totalVotes ?? 0
            const percentage = showResults
              ? totalVotes > 0
                ? (votes / totalVotes) * 100
                : 0
              : 0
            const isMax =
              pollResults && pollResults.totalVotes > 0 && showResults
                ? Object.values(pollResults.results).every((res) => res.size <= votes)
                : false
            const hasSelectedVote = selectedOptionIds.includes(option.id)

            return (
              <button
                key={option.id}
                title={option.label}
                className={cn(
                  'relative flex w-full items-center gap-1.5 overflow-hidden rounded-lg border px-3.5 py-2 transition-all',
                  canVote ? 'cursor-pointer' : 'cursor-default',
                  canVote &&
                    (hasSelectedVote
                      ? 'border-primary bg-primary/20'
                      : 'hover:border-primary/40 hover:bg-primary/5')
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  handleOptionClick(option.id)
                }}
                disabled={!canVote}
              >
                <div className="z-10 flex min-w-0 flex-1 items-center gap-2">
                  {option.image && (
                    <Image
                      image={{ url: option.image }}
                      alt={option.label}
                      className="h-full w-full object-cover"
                      classNames={{ wrapper: 'size-8 shrink-0 rounded-md border bg-muted/30' }}
                      hideIfError
                    />
                  )}
                  <div
                    className={cn(
                      'min-w-0 flex-1 line-clamp-2 text-left text-sm leading-snug',
                      isMax ? 'font-semibold' : ''
                    )}
                  >
                    {option.label}
                  </div>
                  {votedOptionIds.includes(option.id) && (
                    <CheckCircle2 className="size-3.5 shrink-0" />
                  )}
                </div>
                {showResults && (
                  <div
                    className={cn(
                      'z-10 shrink-0 text-sm text-muted-foreground',
                      isMax ? 'font-semibold text-foreground' : ''
                    )}
                  >
                    {percentage.toFixed(1)}%
                  </div>
                )}

                <div
                  className={cn(
                    'absolute inset-0 rounded-r-sm transition-all duration-700 ease-out',
                    isMax ? 'bg-primary/60' : 'bg-muted/90'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {supportsStandardPollInteractions
              ? t('{{number}} votes', { number: pollResults?.totalVotes ?? 0 })
              : t('Results unavailable', { defaultValue: 'Results unavailable' })}
          </div>

          {isLoadingResults && t('Loading...')}
          {!isLoadingResults && showResults && supportsStandardPollInteractions && (
            <div
              className="hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                fetchResults()
              }}
            >
              {!pollResults ? t('Load results') : t('Refresh results')}
            </div>
          )}
        </div>

        {supportsStandardPollInteractions && canVote && !!selectedOptionIds.length && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              if (selectedOptionIds.length === 0) return
              handleVote()
            }}
            disabled={!selectedOptionIds.length || isVoting}
            className="w-full"
          >
            {isVoting && <Loader2 className="animate-spin" />}
            {t('Vote')}
          </Button>
        )}

      </div>
    </div>
  )
}

async function ensurePollRelays(creator: string, poll: { relayUrls: string[] }) {
  const relays = poll.relayUrls.slice(0, 4)
  if (!relays.length) {
    relays.push(
      ...(await client.resolveAuthorOutboxRelayUrls([creator], {
        authorRelayLimit: 4,
        maxRelayCount: 4
      }))
    )
  }
  return relays
}
