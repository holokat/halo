import FollowsRelayRecommendations from '@/components/MailboxSetting/FollowsRelayRecommendations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import {
  createInterestsCustomFeed,
  getCustomFeedHashtags,
  INTERESTS_FEED_ID,
  normalizeCustomFeedHashtag
} from '@/lib/custom-feed'
import { isWebsocketUrl, normalizeUrl, simplifyUrl } from '@/lib/url'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useNewsFeedSettings } from '@/providers/NewsFeedSettingsProvider'
import { Plus, X } from 'lucide-react'
import { FormEvent, forwardRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const FeedsSettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { pubkey, checkLogin } = useNostr()
  const { customFeeds, addCustomFeed, updateCustomFeed } = useCustomFeeds()
  const { favoriteRelays, addFavoriteRelays, deleteFavoriteRelays } = useFavoriteRelays()
  const { feedInfo, switchFeed } = useFeed()
  const { newsRelays, addNewsRelay, removeNewsRelay } = useNewsFeedSettings()
  const [newHashtag, setNewHashtag] = useState('')
  const [draftHashtags, setDraftHashtags] = useState<string[]>([])
  const [hashtagsError, setHashtagsError] = useState<string | null>(null)
  const [newNewsRelay, setNewNewsRelay] = useState('')
  const [newsRelayError, setNewsRelayError] = useState<string | null>(null)
  const [newBookmarkedRelay, setNewBookmarkedRelay] = useState('')
  const [bookmarkedRelayError, setBookmarkedRelayError] = useState<string | null>(null)

  const interestsFeed = useMemo(
    () => customFeeds.find((feed) => feed.id === INTERESTS_FEED_ID),
    [customFeeds]
  )
  const existingHashtags = useMemo(
    () => (interestsFeed ? getCustomFeedHashtags(interestsFeed) : []),
    [interestsFeed]
  )
  const hasInterestChanges = useMemo(
    () => JSON.stringify(draftHashtags) !== JSON.stringify(existingHashtags),
    [draftHashtags, existingHashtags]
  )

  useEffect(() => {
    setDraftHashtags(existingHashtags)
  }, [existingHashtags])

  const addHashtag = (event?: FormEvent) => {
    event?.preventDefault()

    const normalizedHashtag = normalizeCustomFeedHashtag(newHashtag)
    if (!normalizedHashtag) {
      setHashtagsError(t('Enter a hashtag to add', { defaultValue: 'Enter a hashtag to add' }))
      return
    }

    if (draftHashtags.includes(normalizedHashtag)) {
      setHashtagsError(
        t('That hashtag is already included', {
          defaultValue: 'That hashtag is already included'
        })
      )
      return
    }

    setDraftHashtags((current) => [...current, normalizedHashtag])
    setNewHashtag('')
    setHashtagsError(null)
  }

  const removeHashtag = (hashtag: string) => {
    setDraftHashtags((current) => current.filter((value) => value !== hashtag))
    setHashtagsError(null)
  }

  const handleSaveInterests = async () => {
    if (draftHashtags.length === 0) {
      setHashtagsError(
        t('Add at least one hashtag to keep the interests feed useful', {
          defaultValue: 'Add at least one hashtag to keep the interests feed useful'
        })
      )
      return
    }

    const nextFeed = createInterestsCustomFeed(draftHashtags)

    if (interestsFeed) {
      updateCustomFeed(nextFeed.id, nextFeed)
    } else {
      addCustomFeed(nextFeed)
    }

    if (feedInfo.feedType === 'custom' && feedInfo.id === nextFeed.id) {
      await switchFeed('custom', { customFeedId: nextFeed.id })
    }

    toast.success(
      interestsFeed
        ? t('Interests feed updated', { defaultValue: 'Interests feed updated' })
        : t('Interests feed created', { defaultValue: 'Interests feed created' })
    )
  }

  const handleAddNewsRelay = (event?: FormEvent) => {
    event?.preventDefault()

    const normalizedRelay = normalizeUrl(newNewsRelay)
    if (!normalizedRelay || !isWebsocketUrl(normalizedRelay)) {
      setNewsRelayError(t('Enter a valid relay URL', { defaultValue: 'Enter a valid relay URL' }))
      return
    }

    if (newsRelays.includes(normalizedRelay)) {
      setNewsRelayError(
        t('That relay is already included', { defaultValue: 'That relay is already included' })
      )
      return
    }

    addNewsRelay(normalizedRelay)
    setNewNewsRelay('')
    setNewsRelayError(null)
  }

  const handleRemoveNewsRelay = (relay: string) => {
    removeNewsRelay(relay)
    setNewsRelayError(null)
  }

  const handleAddBookmarkedRelay = async (event?: FormEvent) => {
    event?.preventDefault()

    const normalizedRelay = normalizeUrl(newBookmarkedRelay)
    if (!normalizedRelay || !isWebsocketUrl(normalizedRelay)) {
      setBookmarkedRelayError(
        t('Enter a valid relay URL', { defaultValue: 'Enter a valid relay URL' })
      )
      return
    }

    if (favoriteRelays.includes(normalizedRelay)) {
      setBookmarkedRelayError(
        t('That relay is already included', { defaultValue: 'That relay is already included' })
      )
      return
    }

    try {
      await addFavoriteRelays([normalizedRelay])
      setNewBookmarkedRelay('')
      setBookmarkedRelayError(null)
    } catch (error) {
      setBookmarkedRelayError(
        (error as Error)?.message ||
          t('Failed to save relay', { defaultValue: 'Failed to save relay' })
      )
    }
  }

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Feeds')}>
      <div className="space-y-6 px-4 py-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('Interests', { defaultValue: 'Interests' })}</CardTitle>
            <CardDescription>
              {t('Configure hashtags for the optional Interests feed.', {
                defaultValue: 'Configure hashtags for the optional Interests feed.'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="interests-hashtag-input">
                {t('Add hashtag', { defaultValue: 'Add hashtag' })}
              </Label>
              <form className="flex items-center gap-2" onSubmit={addHashtag}>
                <Input
                  id="interests-hashtag-input"
                  value={newHashtag}
                  onChange={(event) => {
                    setNewHashtag(event.target.value)
                    if (hashtagsError) {
                      setHashtagsError(null)
                    }
                  }}
                  placeholder="#technology"
                  className="h-10"
                />
                <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full">
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
              {hashtagsError ? <p className="text-xs text-destructive">{hashtagsError}</p> : null}
            </div>

            {draftHashtags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {draftHashtags.map((hashtag) => (
                  <Badge
                    key={hashtag}
                    variant="secondary"
                    className="flex items-center gap-2 rounded-full px-3 py-1 text-sm"
                  >
                    <span>#{hashtag}</span>
                    <button
                      type="button"
                      className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => removeHashtag(hashtag)}
                      aria-label={t('Remove hashtag', {
                        defaultValue: 'Remove hashtag'
                      })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                {t('No hashtags yet. Add a few to shape the feed.', {
                  defaultValue: 'No hashtags yet. Add a few to shape the feed.'
                })}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => void handleSaveInterests()}
                disabled={!hasInterestChanges || draftHashtags.length === 0}
              >
                {interestsFeed
                  ? t('Update interests', { defaultValue: 'Update interests' })
                  : t('Create interests', { defaultValue: 'Create interests' })}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('News', { defaultValue: 'News' })}</CardTitle>
            <CardDescription>
              {t('Choose relays for the optional News feed.', {
                defaultValue: 'Choose relays for the optional News feed.'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="news-relay-input">
                {t('Add relay', { defaultValue: 'Add relay' })}
              </Label>
              <form className="flex items-center gap-2" onSubmit={handleAddNewsRelay}>
                <Input
                  id="news-relay-input"
                  value={newNewsRelay}
                  onChange={(event) => {
                    setNewNewsRelay(event.target.value)
                    if (newsRelayError) {
                      setNewsRelayError(null)
                    }
                  }}
                  placeholder="wss://news.utxo.one"
                  className="h-10"
                />
                <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full">
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
              {newsRelayError ? <p className="text-xs text-destructive">{newsRelayError}</p> : null}
            </div>

            {newsRelays.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {newsRelays.map((relay) => (
                  <Badge
                    key={relay}
                    variant="secondary"
                    className="flex items-center gap-2 rounded-full px-3 py-1 text-sm"
                  >
                    <span>{simplifyUrl(relay)}</span>
                    <button
                      type="button"
                      className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => handleRemoveNewsRelay(relay)}
                      aria-label={t('Remove relay', { defaultValue: 'Remove relay' })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                {t('No news relays yet. Add one to turn on the feed.', {
                  defaultValue: 'No news relays yet. Add one to turn on the feed.'
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Bookmarked relays', { defaultValue: 'Bookmarked relays' })}</CardTitle>
            <CardDescription>
              {t('Manage your saved relay bookmarks.', {
                defaultValue: 'Manage your saved relay bookmarks.'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pubkey ? (
              <>
                <div className="space-y-3">
                  <Label htmlFor="bookmarked-relay-input">
                    {t('Add relay', { defaultValue: 'Add relay' })}
                  </Label>
                  <form className="flex items-center gap-2" onSubmit={handleAddBookmarkedRelay}>
                    <Input
                      id="bookmarked-relay-input"
                      value={newBookmarkedRelay}
                      onChange={(event) => {
                        setNewBookmarkedRelay(event.target.value)
                        if (bookmarkedRelayError) {
                          setBookmarkedRelayError(null)
                        }
                      }}
                      placeholder="wss://relay.example.com"
                      className="h-10"
                    />
                    <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </form>
                  {bookmarkedRelayError ? (
                    <p className="text-xs text-destructive">{bookmarkedRelayError}</p>
                  ) : null}
                </div>

                {favoriteRelays.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {favoriteRelays.map((relay) => (
                      <Badge
                        key={relay}
                        variant="secondary"
                        className="flex items-center gap-2 rounded-full px-3 py-1 text-sm"
                      >
                        <span>{simplifyUrl(relay)}</span>
                        <button
                          type="button"
                          className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => void deleteFavoriteRelays([relay])}
                          aria-label={t('Remove relay', {
                            defaultValue: 'Remove relay'
                          })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                    {t('No bookmarked relays yet.', {
                      defaultValue: 'No bookmarked relays yet.'
                    })}
                  </div>
                )}

                <FollowsRelayRecommendations
                  existingRelayUrls={favoriteRelays}
                  title={t('From people you follow', {
                    defaultValue: 'From people you follow'
                  })}
                  description={t('Quick picks based on the accounts you already follow.', {
                    defaultValue: 'Quick picks based on the accounts you already follow.'
                  })}
                  onAddRelay={(url) => {
                    void addFavoriteRelays([url])
                  }}
                />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-center">
                <div className="text-sm text-muted-foreground">
                  {t('Sign in to save bookmarked relays to your account.', {
                    defaultValue: 'Sign in to save bookmarked relays to your account.'
                  })}
                </div>
                <Button className="mt-3" onClick={() => checkLogin()}>
                  {t('Login')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SecondaryPageLayout>
  )
})

FeedsSettingsPage.displayName = 'FeedsSettingsPage'

export default FeedsSettingsPage
