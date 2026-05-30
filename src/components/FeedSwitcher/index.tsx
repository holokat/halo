import { toFeedsSettings } from '@/lib/link'
import { getCustomFeedHashtags, INTERESTS_FEED_ID } from '@/lib/custom-feed'
import { isWebsocketUrl, normalizeUrl, simplifyUrl } from '@/lib/url'
import { SecondaryPageLink, useSecondaryPage } from '@/PageManager'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import {
  BookmarkIcon,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Hash,
  Loader2,
  Minus,
  Newspaper,
  Pin,
  TrendingUp,
  UserRound,
  UsersRound
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PinButton from '../PinButton'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import RelayIcon from '../RelayIcon'

function stripRelayProtocol(value: string) {
  return value.trim().replace(/^(?:wss?|https?):\/\//i, '')
}

const primaryFeedItemClassName = 'rounded-2xl'

export default function FeedSwitcher({
  close
}: {
  close?: () => void
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { push } = useSecondaryPage()
  const { favoriteRelays, addFavoriteRelays, deleteFavoriteRelays } = useFavoriteRelays()
  const { feedInfo, switchFeed } = useFeed()
  const { customFeeds } = useCustomFeeds()
  const interestsFeed = useMemo(
    () => customFeeds.find((feed) => feed.id === INTERESTS_FEED_ID),
    [customFeeds]
  )
  const hasConfiguredInterests = useMemo(
    () => !!interestsFeed && getCustomFeedHashtags(interestsFeed).length > 0,
    [interestsFeed]
  )
  const isAdvancedFeedActive = useMemo(
    () =>
      feedInfo.feedType === 'bookmarks' ||
      feedInfo.feedType === 'relay',
    [feedInfo]
  )
  const [showAdvanced, setShowAdvanced] = useState(isAdvancedFeedActive)

  useEffect(() => {
    if (isAdvancedFeedActive) {
      setShowAdvanced(true)
    }
  }, [isAdvancedFeedActive])

  return (
    <div className="space-y-2">
      {pubkey && (
        <FeedSwitcherItem
          className={primaryFeedItemClassName}
          isActive={feedInfo.feedType === 'following'}
          onClick={() => {
            if (!pubkey) return
            switchFeed('following', { pubkey })
            close?.()
          }}
        >
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-6 h-6 shrink-0">
              <UsersRound className="size-4" />
            </div>
            <div>{t('Following')}</div>
          </div>
        </FeedSwitcherItem>
      )}

      <FeedSwitcherItem
        className={primaryFeedItemClassName}
        isActive={feedInfo.feedType === 'trending'}
        onClick={() => {
          switchFeed('trending')
          close?.()
        }}
      >
        <div className="flex gap-2 items-center">
          <div className="flex justify-center items-center w-6 h-6 shrink-0">
            <TrendingUp className="size-4" />
          </div>
          <div>{t('Trending')}</div>
        </div>
      </FeedSwitcherItem>

      <FeedSwitcherItem
        className={primaryFeedItemClassName}
        isActive={feedInfo.feedType === 'news'}
        onClick={() => {
          switchFeed('news')
          close?.()
        }}
      >
        <div className="flex gap-2 items-center">
          <div className="flex justify-center items-center w-6 h-6 shrink-0">
            <Newspaper className="size-4" />
          </div>
          <div>{t('News', { defaultValue: 'News' })}</div>
        </div>
      </FeedSwitcherItem>

      <FeedSwitcherItem
        className={primaryFeedItemClassName}
        isActive={feedInfo.feedType === 'custom' && feedInfo.id === INTERESTS_FEED_ID}
        onClick={() => {
          if (hasConfiguredInterests && interestsFeed) {
            void switchFeed('custom', { customFeedId: interestsFeed.id })
          } else {
            push(toFeedsSettings())
          }
          close?.()
        }}
      >
        <div className="flex gap-2 items-center">
          <div className="flex justify-center items-center w-6 h-6 shrink-0">
            <Hash className="size-4" />
          </div>
          <div>{t('Interests', { defaultValue: 'Interests' })}</div>
        </div>
      </FeedSwitcherItem>

      {pubkey && (
        <FeedSwitcherItem
          isActive={feedInfo.feedType === 'one-per-person'}
          onClick={() => {
            if (!pubkey) return
            switchFeed('one-per-person', { pubkey })
            close?.()
          }}
        >
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-6 h-6 shrink-0">
              <UserRound className="size-4" />
            </div>
            <div>{t('Latest Note')}</div>
          </div>
        </FeedSwitcherItem>
      )}

      {pubkey && (
        <FeedSwitcherItem
          isActive={feedInfo.feedType === 'polls'}
          onClick={() => {
            if (!pubkey) return
            switchFeed('polls', { pubkey })
            close?.()
          }}
        >
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-6 h-6 shrink-0">
              <BarChart3 className="size-4" />
            </div>
            <div>{t('Polls')}</div>
          </div>
        </FeedSwitcherItem>
      )}

      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        onClick={() => setShowAdvanced((prev) => !prev)}
      >
        <span>{showAdvanced ? t('Hide more', { defaultValue: 'Hide more' }) : t('More', { defaultValue: 'More' })}</span>
        {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {showAdvanced && (
        <div className="space-y-2">
          {pubkey && (
            <FeedSwitcherItem
              isActive={feedInfo.feedType === 'bookmarks'}
              onClick={() => {
                if (!pubkey) return
                switchFeed('bookmarks', { pubkey })
                close?.()
              }}
              controls={
                <PinButton
                  column={{ type: 'bookmarks' }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              }
            >
              <div className="flex gap-2 items-center">
                <div className="flex justify-center items-center w-6 h-6 shrink-0">
                  <BookmarkIcon className="size-4" />
                </div>
                <div>{t('Bookmarks')}</div>
              </div>
            </FeedSwitcherItem>
          )}

          {favoriteRelays.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="px-1 text-xs font-semibold text-muted-foreground">
                {t('Bookmarked relays', { defaultValue: 'Bookmarked relays' })}
              </div>
              {favoriteRelays.map((relay) => (
                <FeedSwitcherItem
                  key={relay}
                  isActive={feedInfo.feedType === 'relay' && feedInfo.id === relay}
                  onClick={() => {
                    switchFeed('relay', { relay })
                    close?.()
                  }}
                  controls={
                    <div className="flex gap-1 items-center">
                      <PinButton
                        column={{
                          type: 'relay',
                          props: { url: relay }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      {pubkey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t('Remove bookmark', { defaultValue: 'Remove bookmark' })}
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteFavoriteRelays([relay])
                          }}
                        >
                          <Minus className="size-4" />
                        </Button>
                      )}
                    </div>
                  }
                >
                  <div className="flex gap-2 items-center w-full">
                    <RelayIcon url={relay} />
                    <div className="flex-1 w-0 truncate">{simplifyUrl(relay)}</div>
                  </div>
                </FeedSwitcherItem>
              ))}
            </div>
          )}

          <QuickRelayInput
            close={close}
            favoriteRelays={favoriteRelays}
            pubkey={pubkey}
            activeRelay={feedInfo.feedType === 'relay' ? feedInfo.id : undefined}
            onOpenRelay={async (relay) => {
              await switchFeed('relay', { relay })
            }}
            onSaveRelay={async (relay) => {
              await addFavoriteRelays([relay])
            }}
          />

          <div className="flex justify-end items-center pt-1 text-sm">
            <SecondaryPageLink
              to={toFeedsSettings()}
              className="text-primary font-semibold"
              onClick={() => close?.()}
            >
              {t('Manage feeds', { defaultValue: 'Manage feeds' })}
            </SecondaryPageLink>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickRelayInput({
  close,
  favoriteRelays,
  pubkey,
  activeRelay,
  onOpenRelay,
  onSaveRelay
}: {
  close?: () => void
  favoriteRelays: string[]
  pubkey?: string | null
  activeRelay?: string
  onOpenRelay: (relay: string) => Promise<void>
  onSaveRelay: (relay: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!activeRelay || favoriteRelays.includes(activeRelay)) return
    setInput((currentInput) => currentInput || stripRelayProtocol(activeRelay))
  }, [activeRelay, favoriteRelays])

  const normalizedRelay = useMemo(() => normalizeUrl(input.trim()), [input])
  const isValidRelay = !!normalizedRelay && isWebsocketUrl(normalizedRelay)
  const isSavedRelay = isValidRelay && favoriteRelays.includes(normalizedRelay)
  const inputPrefix = useMemo(() => {
    if (normalizedRelay.startsWith('ws://')) {
      return 'ws://'
    }

    if (input.trim().toLowerCase().startsWith('localhost')) {
      return 'ws://'
    }

    return 'wss://'
  }, [input, normalizedRelay])

  const resolveRelay = () => {
    if (!isValidRelay) {
      setErrorMsg(t('Invalid URL'))
      return null
    }
    return normalizedRelay
  }

  const handleOpenRelay = async () => {
    const relay = resolveRelay()
    if (!relay) return

    setErrorMsg('')
    await onOpenRelay(relay)
    setInput(stripRelayProtocol(relay))
    close?.()
  }

  const handleSaveRelay = async () => {
    const relay = resolveRelay()
    if (!relay || isSavedRelay || !pubkey) return

    setErrorMsg('')
    setIsSaving(true)

    try {
      await onSaveRelay(relay)
      await onOpenRelay(relay)
      setInput(stripRelayProtocol(relay))
      close?.()
    } catch (error) {
      setErrorMsg((error as Error).message || t('Failed to save relay'))
    } finally {
      setIsSaving(false)
    }
  }

  const helperText = isSavedRelay
    ? t('Already saved')
    : pubkey
      ? t('Type a relay host or paste the full URL, then open or save it here')
      : t('Type a relay host or paste the full URL')

  return (
    <div className="rounded-lg border px-3 py-3 space-y-2">
      <div className="text-xs font-semibold">{t('Browse relay')}</div>
      <div className="flex gap-2 items-center">
        <div
          className={`flex flex-1 items-center rounded-lg border bg-background transition-colors ${
            errorMsg ? 'border-destructive' : 'border-input'
          }`}
        >
          <span className="pl-3 text-sm text-muted-foreground shrink-0">{inputPrefix}</span>
          <Input
            placeholder={t('relay.example.com')}
            value={input}
            onChange={(event) => {
              setInput(stripRelayProtocol(event.target.value))
              setErrorMsg('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleOpenRelay()
              }
            }}
            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
          />
        </div>
        <Button onClick={() => void handleOpenRelay()} disabled={!input.trim()}>
          {t('Open')}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 min-h-5">
        <div className="text-xs text-muted-foreground truncate">{helperText}</div>
        {pubkey && !isSavedRelay && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void handleSaveRelay()}
            disabled={!isValidRelay || isSaving}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Pin className="size-4" />}
            {t('Save')}
          </Button>
        )}
      </div>
      {errorMsg && <div className="text-destructive text-sm">{errorMsg}</div>}
    </div>
  )
}

function FeedSwitcherItem({
  children,
  isActive,
  onClick,
  controls,
  className = 'rounded-lg'
}: {
  children: React.ReactNode
  isActive: boolean
  onClick: () => void
  controls?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`w-full border py-1 px-3 group ${className} ${isActive ? 'border-primary bg-primary/5' : 'clickable'}`}
      onClick={onClick}
      style={{ fontSize: 'var(--font-size, 14px)' }}
    >
      <div className="flex justify-between items-center">
        <div className="font-semibold flex-1">{children}</div>
        {controls}
      </div>
    </div>
  )
}
