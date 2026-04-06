import UserAvatar from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { deleteDraftEventCache } from '@/lib/draft-event'
import { minePow } from '@/lib/event'
import { toScheduledPostsSettings } from '@/lib/link'
import {
  createDefaultPollCreateData,
  getDefaultPollEndsAt,
  normalizePollCreateData
} from '@/lib/poll'
import { cn, isTouchDevice } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useNoteExpiration } from '@/providers/NoteExpirationProvider'
import client from '@/services/client.service'
import postEditorCache, { ImageAttachment } from '@/services/post-editor-cache.service'
import scheduledPostsService from '@/services/scheduled-posts.service'
import { TPollCreateData } from '@/types'
import {
  CircleUserRound,
  Clock,
  HelpCircle,
  ImageUp,
  ListTodo,
  LoaderCircle,
  Settings,
  Smile,
  X
} from 'lucide-react'
import { Event, kinds, nip19 } from 'nostr-tools'
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import EmojiPickerDialog from '../EmojiPickerDialog'
import GifPicker from '../GifPicker'
import Mentions from './Mentions'
import PostRelaySelector from './PostRelaySelector'
import PostSchedulePopover from './PostSchedulePopover'
import PollEditor from './PollEditor'
import PostOptions from './PostOptions'
import PostTextarea, { TPostTextareaHandle } from './PostTextarea'
import Uploader from './Uploader'
import ComposerHelpDialog from './ComposerHelpDialog'
import GifIcon from '@/components/icons/GifIcon'
import { hasPrivateKeyInDraft, extractPrivateKeyCandidates } from './post-content/private-key'
import {
  appendExpirationTag,
  appendImageMetadataTags,
  buildScheduledPostDraft,
  clearComposerDraftCache,
  createComposerDraftEvent
} from './post-content/submission'
import {
  ParentEventPreview,
  PollEditorDrawer,
  PrivateKeyWarningBanner,
  ScheduledBanner,
  UploadProgressList
} from './post-content/shared'

export default function PostContent({
  defaultContent = '',
  initialMentionIds = [],
  parentEvent,
  close,
  openFrom,
  isMobileComposer,
  isProtectedEvent,
  additionalRelayUrls,
  setIsProtectedEvent,
  setAdditionalRelayUrls
}: {
  defaultContent?: string
  initialMentionIds?: string[]
  parentEvent?: Event
  close: () => void
  openFrom?: string[]
  isMobileComposer: boolean
  isProtectedEvent: boolean
  additionalRelayUrls: string[]
  setIsProtectedEvent?: Dispatch<SetStateAction<boolean>>
  setAdditionalRelayUrls?: Dispatch<SetStateAction<string[]>>
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { account, pubkey, publish, checkLogin, signEvent } = useNostr()
  const { addReplies, removeReplies } = useReply()
  const { defaultExpiration, getExpirationTimestamp } = useNoteExpiration()
  const [text, setText] = useState('')
  const textareaRef = useRef<TPostTextareaHandle>(null)
  const [posting, setPosting] = useState(false)
  const [uploadProgresses, setUploadProgresses] = useState<
    { file: File; progress: number; cancel: () => void }[]
  >([])
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [addClientTag, setAddClientTag] = useState(false)
  const [mentions, setMentions] = useState<string[]>([])
  const [isNsfw, setIsNsfw] = useState(false)
  const [isPoll, setIsPoll] = useState(false)
  const [pollEditorOpen, setPollEditorOpen] = useState(false)
  const [pollCreateData, setPollCreateData] = useState<TPollCreateData>(createDefaultPollCreateData)
  const [scheduledFor, setScheduledFor] = useState<number | null>(null)
  const [minPow, setMinPow] = useState(0)
  const isFirstRender = useRef(true)
  const hasAppliedInitialMentions = useRef(false)
  const requiredMentionPubkeys = useMemo(
    () =>
      Array.from(
        new Set(
          initialMentionIds
            .map((id) => {
              if (/^[0-9a-f]{64}$/i.test(id)) {
                return id.toLowerCase()
              }

              try {
                const decoded = nip19.decode(id)
                if (decoded.type === 'npub') {
                  return decoded.data
                }
                if (decoded.type === 'nprofile') {
                  return decoded.data.pubkey
                }
              } catch (error) {
                console.warn('Failed to decode initial mention target:', id, error)
              }

              return null
            })
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [initialMentionIds]
  )
  const privateKeyScanText = useMemo(() => {
    const imageAltText = images.map((image) => image.alt?.trim() ?? '').filter(Boolean)
    const pollOptionLabels = isPoll
      ? pollCreateData.options.map((option) => option.label.trim()).filter(Boolean)
      : []
    return [text, ...imageAltText, ...pollOptionLabels].join('\n')
  }, [images, isPoll, pollCreateData.options, text])
  const detectedPrivateKeys = useMemo(
    () => extractPrivateKeyCandidates(privateKeyScanText),
    [privateKeyScanText]
  )
  const hasDetectedPrivateKey = detectedPrivateKeys.length > 0

  const canPost = useMemo(() => {
    return (
      !!pubkey &&
      !!text &&
      !hasDetectedPrivateKey &&
      !posting &&
      !uploadProgresses.length &&
      (!isPoll || pollCreateData.options.filter((option) => !!option.label.trim()).length >= 2) &&
      (!isProtectedEvent || additionalRelayUrls.length > 0)
    )
  }, [
    pubkey,
    text,
    hasDetectedPrivateKey,
    posting,
    uploadProgresses,
    isPoll,
    pollCreateData,
    isProtectedEvent,
    additionalRelayUrls
  ])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      const cachedSettings = postEditorCache.getPostSettingsCache({
        defaultContent,
        parentEvent
      })
      if (cachedSettings) {
        setIsNsfw(cachedSettings.isNsfw ?? false)
        setIsPoll(cachedSettings.isPoll ?? false)
        setPollCreateData(normalizePollCreateData(cachedSettings.pollCreateData))
        setAddClientTag(cachedSettings.addClientTag ?? false)
        setImages(cachedSettings.images ?? [])
        setScheduledFor(cachedSettings.scheduledFor ?? null)
      }
      return
    }
    postEditorCache.setPostSettingsCache(
      { defaultContent, parentEvent },
      {
        isNsfw,
        isPoll,
        pollCreateData,
        addClientTag,
        images,
        scheduledFor
      }
    )
  }, [
    defaultContent,
    parentEvent,
    isNsfw,
    isPoll,
    pollCreateData,
    addClientTag,
    images,
    scheduledFor
  ])

  useEffect(() => {
    if (hasAppliedInitialMentions.current || !initialMentionIds.length || !textareaRef.current) {
      return
    }

    // Only seed the mention into a fresh draft. Cached drafts keep their existing content.
    if (text !== defaultContent.trim()) {
      return
    }

    initialMentionIds.forEach((userId) => {
      textareaRef.current?.insertMention(userId, 'start')
    })
    hasAppliedInitialMentions.current = true
  }, [defaultContent, initialMentionIds, text])

  const post = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    checkLogin(async () => {
      if (hasDetectedPrivateKey) {
        toast.error(
          t('Posting blocked: this note includes an nsec private key. Remove it to protect your account.'),
          { duration: 6000 }
        )
        return
      }

      if (!canPost) return

      setPosting(true)
      try {
        const draftEvent = await createComposerDraftEvent({
          addClientTag,
          images,
          isNsfw,
          isPoll,
          isProtectedEvent,
          mentions,
          parentEvent,
          pollCreateData,
          pubkey: pubkey!,
          requiredMentionPubkeys,
          text
        })

        appendImageMetadataTags(draftEvent, images)
        appendExpirationTag(draftEvent, getExpirationTimestamp(defaultExpiration))

        if (hasPrivateKeyInDraft(draftEvent.content, draftEvent.tags)) {
          toast.error(
            t('Posting blocked: this note includes an nsec private key. Remove it to protect your account.'),
            { duration: 6000 }
          )
          return
        }

        const publishOptions = {
          specifiedRelayUrls: isProtectedEvent ? additionalRelayUrls : undefined,
          additionalRelayUrls: isPoll ? pollCreateData.relays : additionalRelayUrls,
          minPow
        }

        if (parentEvent) {
          const optimisticReply =
            minPow > 0
              ? await signEvent(await minePow({ ...draftEvent, pubkey: pubkey! }, minPow))
              : await signEvent(draftEvent)

          client.addEventToCache(optimisticReply)
          addReplies([optimisticReply])
          close()

          void (async () => {
            try {
              const relays = await client.determineTargetRelays(optimisticReply, publishOptions)
              await client.publishEvent(relays, optimisticReply)
              clearComposerDraftCache(defaultContent, parentEvent)
              deleteDraftEventCache(draftEvent)
              toast.success(t('Post successful'), { duration: 2000 })
            } catch (error) {
              removeReplies([optimisticReply.id])
              const errors = error instanceof AggregateError ? error.errors : [error]
              errors.forEach((err) => {
                toast.error(
                  `${t('Failed to post')}: ${err instanceof Error ? err.message : String(err)}`,
                  { duration: 10_000 }
                )
                console.error(err)
              })
            }
          })()

          return
        }

        const newEvent = await publish(draftEvent, publishOptions)
        clearComposerDraftCache(defaultContent, parentEvent)
        deleteDraftEventCache(draftEvent)
        addReplies([newEvent])
        close()
      } catch (error) {
        const errors = error instanceof AggregateError ? error.errors : [error]
        errors.forEach((err) => {
          toast.error(
            `${t('Failed to post')}: ${err instanceof Error ? err.message : String(err)}`,
            { duration: 10_000 }
          )
          console.error(err)
        })
        return
      } finally {
        setPosting(false)
      }
      if (!parentEvent) {
        toast.success(t('Post successful'), { duration: 2000 })
      }
    })
  }

  const formatScheduledDateTime = useCallback((timestamp: number) => {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(timestamp * 1000)
  }, [])

  const schedulePost = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation()

      checkLogin(() => {
        if (hasDetectedPrivateKey) {
          toast.error(
            t(
              'Scheduling blocked: this note includes an nsec private key. Remove it to protect your account.'
            ),
            { duration: 6000 }
          )
          return
        }

        if (!canPost || !account || !scheduledFor) return

        const now = Math.floor(Date.now() / 1000)
        if (scheduledFor <= now) {
          toast.error(t('Choose a time in the future'))
          return
        }

        scheduledPostsService.addScheduledPost(
          account.pubkey,
          account.signerType,
          buildScheduledPostDraft({
            addClientTag,
            additionalRelayUrls,
            defaultExpiration,
            images,
            isNsfw,
            isPoll,
            isProtectedEvent,
            mentions,
            minPow,
            parentEvent,
            pollCreateData,
            requiredMentionPubkeys,
            text
          }),
          scheduledFor
        )

        clearComposerDraftCache(defaultContent, parentEvent)
        close()
        toast.success(
          t('Scheduled for {{time}}', {
            time: formatScheduledDateTime(scheduledFor)
          }),
          {
            description: t(
              'This note will publish locally from this browser when this account is active.'
            ),
            duration: 4000
          }
        )
      })
    },
    [
      canPost,
      account,
      scheduledFor,
      hasDetectedPrivateKey,
      mentions,
      requiredMentionPubkeys,
      text,
      images,
      parentEvent,
      isProtectedEvent,
      additionalRelayUrls,
      isPoll,
      pollCreateData,
      addClientTag,
      isNsfw,
      defaultExpiration,
      minPow,
      defaultContent,
      close,
      formatScheduledDateTime,
      checkLogin,
      t
    ]
  )

  const hasValidSchedule = !scheduledFor || scheduledFor > Math.floor(Date.now() / 1000)
  const canSubmit = canPost && hasValidSchedule
  const primaryActionLabel = scheduledFor
    ? parentEvent
      ? t('Schedule Reply')
      : t('Schedule')
    : parentEvent
      ? t('Reply')
      : t('Post')
  const primaryActionBusyLabel = parentEvent ? t('Replying...') : t('Posting...')
  const handlePrimaryAction = useCallback(
    (e?: React.MouseEvent) => {
      if (hasDetectedPrivateKey) {
        toast.error(
          t('Posting blocked: this note includes an nsec private key. Remove it to protect your account.'),
          { duration: 6000 }
        )
        return
      }

      if (scheduledFor) {
        schedulePost(e)
        return
      }

      void post(e)
    },
    [scheduledFor, schedulePost, hasDetectedPrivateKey, post, t]
  )

  const handlePollToggle = () => {
    if (parentEvent) return

    if (isMobileComposer) {
      setIsPoll((prev) => {
        if (prev) return prev

        const isPristinePollDraft =
          !pollCreateData.isMultipleChoice &&
          pollCreateData.relays.length === 0 &&
          pollCreateData.options.every((option) => !option.label.trim() && !option.image)

        if (isPristinePollDraft && typeof pollCreateData.endsAt !== 'number') {
          setPollCreateData((current) => ({
            ...current,
            endsAt: getDefaultPollEndsAt()
          }))
        }

        return true
      })
      setPollEditorOpen(true)
      return
    }

    setIsPoll((prev) => {
      const next = !prev

      if (next) {
        const isPristinePollDraft =
          !pollCreateData.isMultipleChoice &&
          pollCreateData.relays.length === 0 &&
          pollCreateData.options.every((option) => !option.label.trim() && !option.image)

        if (isPristinePollDraft && typeof pollCreateData.endsAt !== 'number') {
          setPollCreateData((current) => ({
            ...current,
            endsAt: getDefaultPollEndsAt()
          }))
        }
      }

      return next
    })
  }

  useEffect(() => {
    if (!isPoll) {
      setPollEditorOpen(false)
    }
  }, [isPoll])

  const handleUploadStart = (file: File, cancel: () => void) => {
    setUploadProgresses((prev) => [...prev, { file, progress: 0, cancel }])
  }

  const handleUploadProgress = (file: File, progress: number) => {
    setUploadProgresses((prev) =>
      prev.map((item) => (item.file === file ? { ...item, progress } : item))
    )
  }

  const handleUploadEnd = useCallback((file: File) => {
    setUploadProgresses((prev) => prev.filter((item) => item.file !== file))
  }, [])

  const handleImageUploadSuccess = useCallback((url: string) => {
    // Check if it's an image URL (not video/audio)
    const isImage =
      url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i) ||
      url.includes('image') ||
      url.includes('nostr.build')

    if (isImage) {
      setImages((prev) => {
        const newImages = [...prev, { url }]
        // Scroll to bottom after adding image (small delay for render)
        setTimeout(() => {
          const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]')
          if (scrollArea) {
            scrollArea.scrollTop = scrollArea.scrollHeight
          }
        }, 100)
        return newImages
      })
    } else {
      // For non-images (video/audio), add to textarea as before
      textareaRef.current?.appendText(url, true)
    }
  }, [])

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleUpdateImageAlt = useCallback((index: number, alt: string) => {
    setImages((prev) => prev.map((img, i) => (i === index ? { ...img, alt } : img)))
  }, [])

  const handleViewScheduledQueue = useCallback(() => {
    close()
    window.setTimeout(() => {
      push(toScheduledPostsSettings())
    }, 0)
  }, [close, push])

  const hasRelaySelector = !!(setIsProtectedEvent && setAdditionalRelayUrls)
  const mobilePlaceholder = parentEvent
    ? t('Post your reply', { defaultValue: 'Post your reply' })
    : t("What's happening?", { defaultValue: "What's happening?" })
  const toolButtonClass = cn(
    'bg-foreground/5 hover:bg-foreground/10',
    isMobileComposer && 'h-10 w-10 [&_svg]:size-5'
  )

  const handleCancelUpload = useCallback(
    (file: File, cancel?: () => void) => {
      cancel?.()
      handleUploadEnd(file)
    },
    [handleUploadEnd]
  )

  const parentEventPreview = <ParentEventPreview parentEvent={parentEvent} />

  const composerTextarea = (
    <PostTextarea
      ref={textareaRef}
      text={text}
      setText={setText}
      defaultContent={defaultContent}
      parentEvent={parentEvent}
      onSubmit={() => handlePrimaryAction()}
      className={
        isMobileComposer
          ? 'min-h-[44dvh]'
          : isPoll
            ? 'min-h-20'
            : 'min-h-32'
      }
      placeholder={isMobileComposer ? mobilePlaceholder : undefined}
      isMobileComposer={isMobileComposer}
      onUploadStart={handleUploadStart}
      onUploadProgress={handleUploadProgress}
      onUploadEnd={handleUploadEnd}
      onImageUploadSuccess={handleImageUploadSuccess}
      images={images}
      onRemoveImage={handleRemoveImage}
      onUpdateImageAlt={handleUpdateImageAlt}
    />
  )

  const uploadProgressList = (
    <UploadProgressList
      onCancelUpload={handleCancelUpload}
      t={t}
      uploadProgresses={uploadProgresses}
    />
  )

  const scheduledBanner = (
    <ScheduledBanner
      formatScheduledDateTime={formatScheduledDateTime}
      onClear={() => setScheduledFor(null)}
      scheduledFor={scheduledFor}
      t={t}
    />
  )
  const privateKeyWarningBanner = (
    <PrivateKeyWarningBanner hasDetectedPrivateKey={hasDetectedPrivateKey} t={t} />
  )

  const pollOptionsCount = pollCreateData.options.filter((option) => option.label.trim()).length
  const hasMinimumPollOptions = pollOptionsCount >= 2
  const pollBanner =
    isMobileComposer && isPoll && hasMinimumPollOptions ? (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
        <div className="min-w-0 truncate text-muted-foreground">
          {t('Poll attached', { defaultValue: 'Poll attached' })} ·{' '}
          {t('{{count}} options', { count: pollOptionsCount })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setPollEditorOpen(true)}
        >
          {t('Edit')}
        </Button>
      </div>
    ) : null

  const composerTools = (
    <>
      <Uploader
        onUploadSuccess={({ url }) => {
          handleImageUploadSuccess(url)
        }}
        onUploadStart={handleUploadStart}
        onUploadEnd={handleUploadEnd}
        onProgress={handleUploadProgress}
        accept="image/*,video/*,audio/*"
      >
        <Button variant="ghost" size="icon" className={toolButtonClass}>
          <ImageUp />
        </Button>
      </Uploader>
      <GifPicker
        onGifSelect={(url) => {
          setImages((prev) => [...prev, { url }])
        }}
      >
        <Button variant="ghost" size="icon" className={toolButtonClass}>
          <GifIcon />
        </Button>
      </GifPicker>
      {/* I'm not sure why, but after triggering the virtual keyboard,
          opening the emoji picker drawer causes an issue,
          the emoji I tap isn't the one that gets inserted. */}
      {!isTouchDevice() && (
        <EmojiPickerDialog
          onEmojiClick={(emoji) => {
            if (!emoji) return
            textareaRef.current?.insertEmoji(emoji)
          }}
        >
          <Button variant="ghost" size="icon" className={toolButtonClass}>
            <Smile />
          </Button>
        </EmojiPickerDialog>
      )}
      {!parentEvent && (
        <Button
          variant="ghost"
          size="icon"
          title={t('Create Poll')}
          className={cn(toolButtonClass, isPoll && 'bg-accent')}
          onClick={handlePollToggle}
        >
          <ListTodo />
        </Button>
      )}
      <PostSchedulePopover
        scheduledFor={scheduledFor}
        onScheduledForChange={setScheduledFor}
        signerType={account?.signerType}
        onViewQueue={handleViewScheduledQueue}
        buttonClassName={isMobileComposer ? 'h-10 w-10 [&_svg]:size-5' : undefined}
      />
      <Button
        variant="ghost"
        size="icon"
        className={cn(toolButtonClass, showMoreOptions && 'bg-accent')}
        onClick={() => setShowMoreOptions((pre) => !pre)}
      >
        <Settings />
      </Button>
      <ComposerHelpDialog>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-muted-foreground/60 hover:bg-foreground/5 hover:text-muted-foreground',
            isMobileComposer && 'h-10 w-10 [&_svg]:size-5'
          )}
          title={t('Composer Help')}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </ComposerHelpDialog>
    </>
  )

  if (isMobileComposer) {
    return (
      <>
        <div className="flex h-full flex-col overflow-x-hidden bg-background">
          <div className="flex items-center justify-between border-b border-border/60 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <Button
              variant="ghost"
              className="h-9 px-0 text-[length:var(--font-size,15px)] font-medium"
              onClick={(e) => {
                e.stopPropagation()
                close()
              }}
            >
              {t('Cancel')}
            </Button>
            <div className="flex items-center gap-1">
              {hasRelaySelector && (
                <PostRelaySelector
                  parentEvent={parentEvent}
                  openFrom={openFrom}
                  mobileCompact
                  setIsProtectedEvent={setIsProtectedEvent!}
                  setAdditionalRelayUrls={setAdditionalRelayUrls!}
                />
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                onClick={handlePrimaryAction}
                aria-busy={posting}
                aria-label={posting ? primaryActionBusyLabel : primaryActionLabel}
                className="h-9 rounded-full px-4 text-sm font-semibold"
              >
                {posting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {primaryActionLabel}
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-4 py-4">
            {parentEventPreview}
            <div className="flex items-start gap-3">
              {pubkey ? (
                <UserAvatar userId={pubkey} size="semiBig" noLink />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CircleUserRound className="h-9 w-9" />
                </div>
              )}
              <div className="min-w-0 flex-1">{composerTextarea}</div>
            </div>
            {pollBanner}
            {privateKeyWarningBanner}
            {uploadProgressList}
            {scheduledBanner}
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center gap-2 px-1 pb-1">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {composerTools}
              </div>
              <div className="shrink-0">
                <Mentions
                  content={text}
                  parentEvent={parentEvent}
                  mentions={mentions}
                  setMentions={setMentions}
                />
              </div>
            </div>

            <div className="px-1 pt-3">
              <PostOptions
                posting={posting}
                show={showMoreOptions}
                addClientTag={addClientTag}
                setAddClientTag={setAddClientTag}
                isNsfw={isNsfw}
                setIsNsfw={setIsNsfw}
                minPow={minPow}
                setMinPow={setMinPow}
              />
            </div>
          </div>
        </div>
        <PollEditorDrawer
          onOpenChange={(nextOpen) => {
            setPollEditorOpen(nextOpen)
            if (!nextOpen) {
              const validOptionCount = pollCreateData.options.filter((option) =>
                option.label.trim()
              ).length
              if (validOptionCount < 2) {
                setIsPoll(false)
              }
            }
          }}
          pollCreateData={pollCreateData}
          pollEditorOpen={pollEditorOpen}
          setIsPoll={setIsPoll}
          setPollCreateData={setPollCreateData}
          t={t}
        />
      </>
    )
  }

  return (
    <div className="space-y-2">
      {parentEventPreview}
      {composerTextarea}
      {isPoll && (
        <PollEditor
          pollCreateData={pollCreateData}
          setPollCreateData={setPollCreateData}
          setIsPoll={setIsPoll}
        />
      )}
      {uploadProgressList}
      {scheduledBanner}
      {privateKeyWarningBanner}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">{composerTools}</div>
        <div className="flex items-center gap-2">
          <Mentions
            content={text}
            parentEvent={parentEvent}
            mentions={mentions}
            setMentions={setMentions}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                close()
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              onClick={handlePrimaryAction}
              aria-busy={posting}
              aria-label={posting ? primaryActionBusyLabel : primaryActionLabel}
            >
              {posting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>
      <PostOptions
        posting={posting}
        show={showMoreOptions}
        addClientTag={addClientTag}
        setAddClientTag={setAddClientTag}
        isNsfw={isNsfw}
        setIsNsfw={setIsNsfw}
        minPow={minPow}
        setMinPow={setMinPow}
      />
    </div>
  )
}
