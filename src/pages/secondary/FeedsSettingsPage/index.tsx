import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import {
  createInterestsCustomFeed,
  getCustomFeedHashtags,
  INTERESTS_FEED_ID,
  normalizeCustomFeedHashtag
} from '@/lib/custom-feed'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFeed } from '@/providers/FeedProvider'
import { Plus, X } from 'lucide-react'
import { FormEvent, forwardRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const FeedsSettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { customFeeds, addCustomFeed, updateCustomFeed } = useCustomFeeds()
  const { feedInfo, switchFeed } = useFeed()
  const [newHashtag, setNewHashtag] = useState('')
  const [draftHashtags, setDraftHashtags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const interestsFeed = useMemo(
    () => customFeeds.find((feed) => feed.id === INTERESTS_FEED_ID),
    [customFeeds]
  )
  const existingHashtags = useMemo(
    () => (interestsFeed ? getCustomFeedHashtags(interestsFeed) : []),
    [interestsFeed]
  )
  const hasChanges = useMemo(
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
      setError(t('Enter a hashtag to add', { defaultValue: 'Enter a hashtag to add' }))
      return
    }

    if (draftHashtags.includes(normalizedHashtag)) {
      setError(t('That hashtag is already included', { defaultValue: 'That hashtag is already included' }))
      return
    }

    setDraftHashtags((current) => [...current, normalizedHashtag])
    setNewHashtag('')
    setError(null)
  }

  const removeHashtag = (hashtag: string) => {
    setDraftHashtags((current) => current.filter((value) => value !== hashtag))
    setError(null)
  }

  const handleSave = async () => {
    if (draftHashtags.length === 0) {
      setError(
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

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Feeds')}>
      <div className="space-y-6 px-4 py-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{t('Interests feed', { defaultValue: 'Interests feed' })}</h2>
          <p className="text-sm text-muted-foreground">
            {t('Manage the hashtags used for your default Interests feed.', {
              defaultValue: 'Manage the hashtags used for your default Interests feed.'
            })}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border bg-background/60 p-4">
          <Label htmlFor="interests-hashtag-input">
            {t('Add hashtag', { defaultValue: 'Add hashtag' })}
          </Label>
          <form className="flex items-center gap-2" onSubmit={addHashtag}>
            <Input
              id="interests-hashtag-input"
              value={newHashtag}
              onChange={(event) => {
                setNewHashtag(event.target.value)
                if (error) {
                  setError(null)
                }
              }}
              placeholder="#technology"
              className="h-10"
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

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
                    aria-label={t('Remove hashtag', { defaultValue: 'Remove hashtag' })}
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
        </div>

        <Button onClick={() => void handleSave()} disabled={!hasChanges || draftHashtags.length === 0}>
          {interestsFeed
            ? t('Update feed', { defaultValue: 'Update feed' })
            : t('Create feed', { defaultValue: 'Create feed' })}
        </Button>
      </div>
    </SecondaryPageLayout>
  )
})

FeedsSettingsPage.displayName = 'FeedsSettingsPage'

export default FeedsSettingsPage
