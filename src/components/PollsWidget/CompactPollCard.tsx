import Image from '@/components/Image'
import ZapDialog from '@/components/ZapDialog'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { Button } from '@/components/ui/button'
import { POLL_TYPE } from '@/constants'
import { cn } from '@/lib/utils'
import { createPollResponseDraftEvent } from '@/lib/draft-event'
import { getDefaultLegacyZapPollAmount, getLegacyZapPollResults, type TLegacyZapPollResults } from '@/lib/poll'
import { useFetchPollResults } from '@/hooks/useFetchPollResults'
import { useNostr } from '@/providers/NostrProvider'
import { useZap } from '@/providers/ZapProvider'
import pollResultsService from '@/services/poll-results.service'
import { CheckCircle2, Loader2, Trophy } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PollMetadata, ensurePollRelays, formatPollStatusLabel, getPollPrompt } from './poll-widget.utils'

export function CompactPollCard({
  event,
  poll,
  legacyResults,
  now,
  commentCount,
  votedOptionIds,
  isExpired,
  onOpen
}: {
  event: Event
  poll: PollMetadata
  legacyResults?: TLegacyZapPollResults
  now: number
  commentCount: number
  votedOptionIds: string[]
  isExpired: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { pubkey, publish, checkLogin } = useNostr()
  const { defaultZapSats } = useZap()
  const pollResults = useFetchPollResults(event.id)
  const [isVoting, setIsVoting] = useState(false)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [openZapDialog, setOpenZapDialog] = useState(false)
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])

  const isLegacyZapPoll = poll.format === 'legacy_zap'
  const isMultipleChoice = !isLegacyZapPoll && poll.pollType === POLL_TYPE.MULTIPLE_CHOICE
  const hasVoted = votedOptionIds.length > 0
  const canVote = !isExpired && !hasVoted && !isVoting && event.pubkey !== pubkey
  const showResults = isExpired || hasVoted || event.pubkey === pubkey
  const defaultZapAmount = useMemo(
    () => getDefaultLegacyZapPollAmount(poll, defaultZapSats),
    [defaultZapSats, poll]
  )

  const fetchResults = useCallback(async () => {
    if (isLegacyZapPoll || isLoadingResults) return

    setIsLoadingResults(true)
    try {
      const relays = await ensurePollRelays(event.pubkey, poll)
      const results = await pollResultsService.fetchResults(
        event.id,
        relays,
        poll.options.map((option) => option.id),
        isMultipleChoice,
        poll.endsAt
      )
      return results
    } catch (error) {
      console.error('Failed to fetch compact poll results:', error)
      toast.error('Failed to fetch poll results: ' + (error as Error).message)
    } finally {
      setIsLoadingResults(false)
    }
  }, [event.id, event.pubkey, isLegacyZapPoll, isLoadingResults, isMultipleChoice, poll])

  useEffect(() => {
    if (isLegacyZapPoll || !showResults || pollResults || isLoadingResults) return
    void fetchResults()
  }, [fetchResults, isLegacyZapPoll, isLoadingResults, pollResults, showResults])

  const handleVote = useCallback(
    async (optionIds: string[]) => {
      if (isLegacyZapPoll) return
      if (!optionIds.length) return

      await checkLogin(async () => {
        if (!pubkey) return

        setIsVoting(true)
        try {
          const existingResults = pollResults ?? (await fetchResults())
          if (existingResults?.voters.has(pubkey)) {
            return
          }

          const additionalRelayUrls = await ensurePollRelays(event.pubkey, poll)
          const draftEvent = createPollResponseDraftEvent(event, optionIds)
          await publish(draftEvent, {
            additionalRelayUrls
          })

          setSelectedOptionIds([])
          pollResultsService.addPollResponse(event.id, pubkey, optionIds)
        } catch (error) {
          console.error('Failed to vote from polls widget:', error)
          toast.error('Failed to vote: ' + (error as Error).message)
        } finally {
          setIsVoting(false)
        }
      })
    },
    [checkLogin, event, fetchResults, isLegacyZapPoll, poll, pollResults, pubkey, publish]
  )

  const handleOptionClick = (optionId: string) => {
    if (!canVote) return

    if (isLegacyZapPoll) {
      setSelectedOptionIds((prev) => (prev.includes(optionId) ? [] : [optionId]))
      return
    }

    if (isMultipleChoice) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      )
      return
    }

    void handleVote([optionId])
  }

  const optionResults = poll.options.map((option) => {
    const legacyOptionResult = legacyResults?.results?.[option.id]
    const votes = isLegacyZapPoll
      ? legacyOptionResult?.votes ?? 0
      : pollResults?.results?.[option.id]?.size ?? 0
    const amount = legacyOptionResult?.amount ?? 0
    const percentage = isLegacyZapPoll
      ? legacyOptionResult?.percentage ?? 0
      : (pollResults?.totalVotes ?? 0) > 0
        ? (votes / (pollResults?.totalVotes ?? 0)) * 100
        : 0

    return {
      ...option,
      amount,
      votes,
      percentage
    }
  })
  const highestVoteCount = optionResults.reduce(
    (maxVotes, option) => Math.max(maxVotes, isLegacyZapPoll ? option.amount : option.votes),
    0
  )
  const winningOptionCount =
    highestVoteCount > 0
      ? optionResults.filter((option) =>
          (isLegacyZapPoll ? option.amount : option.votes) === highestVoteCount
        ).length
      : 0

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-lg border border-border/70 bg-background/50 p-3 text-left transition-colors hover:bg-accent/40"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <SimpleUserAvatar userId={event.pubkey} size="tiny" className="shrink-0" />
        <SimpleUsername
          userId={event.pubkey}
          className="min-w-0 truncate text-[11px] font-medium text-muted-foreground"
        />
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            isExpired
              ? 'bg-muted text-muted-foreground'
              : hasVoted
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          )}
        >
          {isExpired
            ? t('Ended', { defaultValue: 'Ended' })
            : hasVoted
              ? t('Voted', { defaultValue: 'Voted' })
              : t('Active', { defaultValue: 'Active' })}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{getPollPrompt(event.content, t)}</p>

      {isMultipleChoice && canVote && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t('Select one or more options', {
            defaultValue: 'Select one or more options'
          })}
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {optionResults.map((option) =>
          showResults ? (
            (() => {
              const isWinningOption =
                isExpired &&
                highestVoteCount > 0 &&
                (isLegacyZapPoll ? option.amount : option.votes) === highestVoteCount

              return (
                <div
                  key={option.id}
                  className={cn(
                    'relative overflow-hidden rounded-md border bg-muted/20',
                    isWinningOption
                      ? 'border-primary/50 bg-primary/5 shadow-sm'
                      : 'border-border/70'
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-r-sm transition-all duration-700',
                      isWinningOption ? 'bg-primary/30' : 'bg-primary/18',
                      votedOptionIds.includes(option.id) && 'bg-primary/28'
                    )}
                    style={{ width: `${option.percentage}%` }}
                  />
                  <div className="relative flex items-center gap-2 px-2 py-1.5">
                    <PollOptionThumbnail image={option.image} alt={option.label} className="size-7" />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[11px] leading-tight',
                        (votedOptionIds.includes(option.id) || isWinningOption) &&
                          'font-medium text-foreground'
                      )}
                    >
                      {option.label}
                    </span>
                    {isWinningOption && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                        <Trophy className="h-2.5 w-2.5" />
                        {winningOptionCount > 1
                          ? t('Tied', { defaultValue: 'Tied' })
                          : t('Winner', { defaultValue: 'Winner' })}
                      </span>
                    )}
                    {votedOptionIds.includes(option.id) && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span
                      className={cn(
                        'shrink-0 text-[10px] text-muted-foreground',
                        isWinningOption && 'font-semibold text-foreground'
                      )}
                    >
                      {Math.round(option.percentage)}%
                    </span>
                  </div>
                </div>
              )
            })()
          ) : (
            <button
              key={option.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-left text-[11px] transition-colors',
                selectedOptionIds.includes(option.id)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-primary/5'
              )}
              onClick={(event) => {
                event.stopPropagation()
                void handleOptionClick(option.id)
              }}
              disabled={!canVote}
            >
              <div className="flex min-w-0 items-center gap-2">
                <PollOptionThumbnail image={option.image} alt={option.label} className="size-7" />
                <span className="truncate leading-tight">{option.label}</span>
              </div>
              {isVoting && !isMultipleChoice && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </button>
          )
        )}
      </div>

      {isMultipleChoice && canVote && selectedOptionIds.length > 0 && (
        <Button
          className="mt-2 h-7 w-full text-xs"
          disabled={isVoting}
          onClick={(event) => {
            event.stopPropagation()
            void handleVote(selectedOptionIds)
          }}
        >
          {isVoting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t('Vote', { defaultValue: 'Vote' })}
        </Button>
      )}

      {isLegacyZapPoll && canVote && selectedOptionIds.length > 0 && (
        <>
          <Button
            className="mt-2 h-7 w-full text-xs"
            disabled={isVoting}
            onClick={(event) => {
              event.stopPropagation()
              setOpenZapDialog(true)
            }}
          >
            {t('Zap {{amount}} sats', {
              amount: defaultZapAmount,
              defaultValue: 'Zap {{amount}} sats'
            })}
          </Button>

          <ZapDialog
            open={openZapDialog}
            setOpen={setOpenZapDialog}
            pubkey={event.pubkey}
            event={event}
            defaultAmount={defaultZapAmount}
            defaultComment=""
            extraZapRequestTags={[['poll_option', selectedOptionIds[0]]]}
            pollOptionId={selectedOptionIds[0]}
            onSuccess={() => {
              setSelectedOptionIds([])
            }}
          />
        </>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {formatPollStatusLabel(poll.endsAt, now, t)}
        </span>
        <span>
          {commentCount > 0
            ? t('{{count}} replies', { count: commentCount, defaultValue: '{{count}} replies' })
            : t('No replies', { defaultValue: 'No replies' })}
        </span>
      </div>
    </div>
  )
}

function PollOptionThumbnail({
  image,
  alt,
  className
}: {
  image?: string
  alt: string
  className?: string
}) {
  if (!image) return null

  return (
    <Image
      image={{ url: image }}
      alt={alt}
      className="h-full w-full object-cover"
      classNames={{ wrapper: cn('shrink-0 rounded-[6px] border bg-muted/30', className) }}
      hideIfError
    />
  )
}
