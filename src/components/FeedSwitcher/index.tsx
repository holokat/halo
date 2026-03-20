import { toRelaySettings } from '@/lib/link'
import { isWebsocketUrl, normalizeUrl, simplifyUrl } from '@/lib/url'
import { SecondaryPageLink, usePrimaryPage } from '@/PageManager'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import {
  BookOpen,
  BookmarkIcon,
  BarChart3,
  Hash,
  Highlighter,
  Loader2,
  Minus,
  Pin,
  Search,
  Trash2,
  UserRound,
  UsersRound
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PinButton from '../PinButton'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import RelayIcon from '../RelayIcon'
import RelaySetCard from '../RelaySetCard'

function stripRelayProtocol(value: string) {
  return value.trim().replace(/^(?:wss?|https?):\/\//i, '')
}

export default function FeedSwitcher({
  close,
  showReadsOption = false
}: {
  close?: () => void
  showReadsOption?: boolean
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { navigate, current } = usePrimaryPage()
  const { relaySets, favoriteRelays, addFavoriteRelays, deleteFavoriteRelays } =
    useFavoriteRelays()
  const { feedInfo, switchFeed } = useFeed()
  const { customFeeds, removeCustomFeed } = useCustomFeeds()

  return (
    <div className="space-y-2">
      {pubkey && (
        <FeedSwitcherItem
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

      {showReadsOption && (
        <FeedSwitcherItem
          isActive={current === 'reads'}
          onClick={() => {
            navigate('reads')
            close?.()
          }}
        >
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-6 h-6 shrink-0">
              <BookOpen className="size-4" />
            </div>
            <div>{t('Reads')}</div>
          </div>
        </FeedSwitcherItem>
      )}

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

      {pubkey && (
        <FeedSwitcherItem
          isActive={feedInfo.feedType === 'highlights'}
          onClick={() => {
            if (!pubkey) return
            switchFeed('highlights', { pubkey })
            close?.()
          }}
          controls={
            <PinButton
              column={{ type: 'highlights' }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          }
        >
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-6 h-6 shrink-0">
              <Highlighter className="size-4" />
            </div>
            <div>{t('Highlights')}</div>
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

      {customFeeds.length > 0 && (
        <>
          <div className="text-xs font-semibold mt-4 mb-2">
            {t('Custom Feeds')}
          </div>
          {customFeeds.map((feed) => (
            <FeedSwitcherItem
              key={feed.id}
              isActive={feedInfo.feedType === 'custom' && feedInfo.id === feed.id}
              onClick={() => {
                switchFeed('custom', { customFeedId: feed.id })
                close?.()
              }}
              controls={
                <div className="flex gap-1 items-center">
                  <PinButton
                    column={{
                      type: 'custom',
                      props: { customFeedId: feed.id }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCustomFeed(feed.id)
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              }
            >
              <div className="flex gap-2 items-center">
                <div className="flex justify-center items-center w-6 h-6 shrink-0">
                  {feed.searchParams.type === 'hashtag' ? (
                    <Hash className="size-4" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </div>
                <div className="truncate">{feed.name}</div>
              </div>
            </FeedSwitcherItem>
          ))}
        </>
      )}

      <div className="flex justify-end items-center text-sm">
        <SecondaryPageLink
          to={toRelaySettings()}
          className="text-primary font-semibold"
          onClick={() => close?.()}
        >
          {t('edit')}
        </SecondaryPageLink>
      </div>
      {relaySets
        .filter((set) => set.relayUrls.length > 0)
        .map((set) => (
          <RelaySetCard
            key={set.id}
            relaySet={set}
            select={feedInfo.feedType === 'relays' && set.id === feedInfo.id}
            onSelectChange={(select) => {
              if (!select) return
              switchFeed('relays', { activeRelaySetId: set.id })
              close?.()
            }}
          />
        ))}
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
                  title={t('Unfavorite')}
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
  controls
}: {
  children: React.ReactNode
  isActive: boolean
  onClick: () => void
  controls?: React.ReactNode
}) {
  return (
    <div
      className={`w-full border rounded-lg py-1 px-3 group ${isActive ? 'border-primary bg-primary/5' : 'clickable'}`}
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
