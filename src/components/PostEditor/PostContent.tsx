import UserAvatar from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { deleteDraftEventCache } from '@/lib/draft-event'
import { minePow } from '@/lib/event'
import { createDefaultPollCreateData, normalizePollCreateData } from '@/lib/poll'
import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useNoteExpiration } from '@/providers/NoteExpirationProvider'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import postEditorCache, { ImageAttachment } from '@/services/post-editor-cache.service'
import scheduledPostsService from '@/services/scheduled-posts.service'
import { TLocalPostDraft, TPollCreateData } from '@/types'
import { CircleUserRound, ImageUp, LoaderCircle, X } from 'lucide-react'
import { Event, kinds, nip19 } from 'nostr-tools'
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Mentions from './Mentions'
import PostRelaySelector from './PostRelaySelector'
import PollEditor from './PollEditor'
import PostOptions from './PostOptions'
import PostTextarea, { TPostTextareaHandle } from './PostTextarea'
import Uploader from './Uploader'
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
  close: (options?: { saveLocalDraft?: boolean }) => void
  openFrom?: string[]
  isMobileComposer: boolean
  isProtectedEvent: boolean
  additionalRelayUrls: string[]
  setIsProtectedEvent?: Dispatch<SetStateAction<boolean>>
  setAdditionalRelayUrls?: Dispatch<SetStateAction<string[]>>
}) {
  const { t } = useTranslation()
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
  const [addClientTag, setAddClientTag] = useState(false)
  const [mentions, setMentions] = useState<string[]>([])
  const [isNsfw, setIsNsfw] = useState(false)
  const [isPoll, setIsPoll] = useState(false)
  const [pollEditorOpen, setPollEditorOpen] = useState(false)
  const [pollCreateData, setPollCreateData] = useState<TPollCreateData>(createDefaultPollCreateData)
  const [scheduledFor, setScheduledFor] = useState<number | null>(null)
  const [minPow, setMinPow] = useState(0)
  const [localDrafts, setLocalDrafts] = useState<TLocalPostDraft[]>([])
  const [activeLocalDraftId, setActiveLocalDraftId] = useState<string | null>(null)
  const isFirstRender = useRef(true)
  const hasAppliedInitialMentions = useRef(false)
  const draftOwnerPubkey = account?.pubkey ?? pubkey ?? null
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
    const hasPostContent = text.trim().length > 0 || images.length > 0

    return (
      !!pubkey &&
      hasPostContent &&
      !hasDetectedPrivateKey &&
      !posting &&
      !uploadProgresses.length &&
      (!isPoll || pollCreateData.options.filter((option) => !!option.label.trim()).length >= 2) &&
      (!isProtectedEvent || additionalRelayUrls.length > 0)
    )
  }, [
    pubkey,
    text,
    images.length,
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
        setMinPow(cachedSettings.minPow ?? 0)
        setActiveLocalDraftId(cachedSettings.activeLocalDraftId ?? null)
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
        scheduledFor,
        minPow,
        activeLocalDraftId
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
    scheduledFor,
    minPow,
    activeLocalDraftId
  ])

  const refreshLocalDrafts = useCallback(() => {
    if (!draftOwnerPubkey || parentEvent) {
      setLocalDrafts([])
      return
    }

    setLocalDrafts(storage.getLocalPostDrafts(draftOwnerPubkey))
  }, [draftOwnerPubkey, parentEvent])

  useEffect(() => {
    refreshLocalDrafts()
  }, [refreshLocalDrafts])

  useEffect(() => {
    if (activeLocalDraftId && !localDrafts.some((draft) => draft.id === activeLocalDraftId)) {
      setActiveLocalDraftId(null)
    }
  }, [activeLocalDraftId, localDrafts])

  const clearUsedLocalDraft = useCallback(() => {
    if (!draftOwnerPubkey || !activeLocalDraftId) {
      return
    }

    storage.removeLocalPostDraft(activeLocalDraftId, draftOwnerPubkey)
    setActiveLocalDraftId(null)
    refreshLocalDrafts()
  }, [activeLocalDraftId, draftOwnerPubkey, refreshLocalDrafts])

  const handleSelectLocalDraft = useCallback((draft: TLocalPostDraft) => {
    setImages(draft.images)
    setIsNsfw(draft.isNsfw)
    setIsPoll(draft.isPoll)
    setPollCreateData(normalizePollCreateData(draft.pollCreateData))
    setAddClientTag(draft.addClientTag)
    setScheduledFor(draft.scheduledFor)
    setMinPow(draft.minPow)
    setActiveLocalDraftId(draft.id)
  }, [])

  const handleDeleteLocalDraft = useCallback(
    (draftId: string) => {
      if (!draftOwnerPubkey) {
        return
      }

      storage.removeLocalPostDraft(draftId, draftOwnerPubkey)
      if (activeLocalDraftId === draftId) {
        setActiveLocalDraftId(null)
      }
      refreshLocalDrafts()
    },
    [activeLocalDraftId, draftOwnerPubkey, refreshLocalDrafts]
  )

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
      const submissionStartedAt = getNowMs()
      if (hasDetectedPrivateKey) {
        toast.error(
          t(
            'Posting blocked: this note includes an nsec private key. Remove it to protect your account.'
          ),
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

        console.debug('[PostPublish]', 'composer draft prepared', {
          imageCount: images.length,
          isReply: Boolean(parentEvent),
          minPow,
          pollOptionCount: isPoll ? pollCreateData.options.length : 0,
          prepareDurationMs: roundDurationMs(submissionStartedAt),
          textLength: text.length
        })

        appendImageMetadataTags(draftEvent, images)
        appendExpirationTag(draftEvent, getExpirationTimestamp(defaultExpiration))

        if (hasPrivateKeyInDraft(draftEvent.content, draftEvent.tags)) {
          toast.error(
            t(
              'Posting blocked: this note includes an nsec private key. Remove it to protect your account.'
            ),
            { duration: 6000 }
          )
          return
        }

        const publishOptions = {
          specifiedRelayUrls: isProtectedEvent ? additionalRelayUrls : undefined,
          additionalRelayUrls: isPoll ? pollCreateData.relays : additionalRelayUrls,
          minPow,
          minSuccessCount: 1
        }

        if (parentEvent) {
          const optimisticReply =
            minPow > 0
              ? await signEvent(await minePow({ ...draftEvent, pubkey: pubkey! }, minPow))
              : await signEvent(draftEvent)

          client.addEventToCache(optimisticReply)
          addReplies([optimisticReply])

          console.debug('[PostPublish]', 'composer handing off reply to background publish', {
            eventId: optimisticReply.id,
            signAndPrepareDurationMs: roundDurationMs(submissionStartedAt)
          })

          close({ saveLocalDraft: false })

          void (async () => {
            try {
              const relays = await client.determineTargetRelays(optimisticReply, publishOptions)
              await client.publishEvent(relays, optimisticReply, {
                minSuccessCount: publishOptions.minSuccessCount
              })
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
        clearUsedLocalDraft()
        clearComposerDraftCache(defaultContent, parentEvent)
        deleteDraftEventCache(draftEvent)
        addReplies([newEvent])
        close({ saveLocalDraft: false })
        toast.success(t('Post successful'), { duration: 2000 })
        return
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

        clearUsedLocalDraft()
        clearComposerDraftCache(defaultContent, parentEvent)
        close({ saveLocalDraft: false })
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
      clearUsedLocalDraft,
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
          t(
            'Posting blocked: this note includes an nsec private key. Remove it to protect your account.'
          ),
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
      className={isMobileComposer ? 'min-h-[44dvh]' : isPoll ? 'min-h-20' : 'min-h-32'}
      placeholder={isMobileComposer ? mobilePlaceholder : undefined}
      isMobileComposer={isMobileComposer}
      onUploadStart={handleUploadStart}
      onUploadProgress={handleUploadProgress}
      onUploadEnd={handleUploadEnd}
      onImageUploadSuccess={handleImageUploadSuccess}
      images={images}
      onRemoveImage={handleRemoveImage}
      localDrafts={localDrafts}
      activeLocalDraftId={activeLocalDraftId}
      onSelectLocalDraft={handleSelectLocalDraft}
      onDeleteLocalDraft={handleDeleteLocalDraft}
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
    <Uploader
      onUploadSuccess={({ url }) => {
        handleImageUploadSuccess(url)
      }}
      onUploadStart={handleUploadStart}
      onUploadEnd={handleUploadEnd}
      onProgress={handleUploadProgress}
      accept="image/*,video/*,audio/*"
    >
      <Button
        variant="ghost"
        size="icon"
        className={toolButtonClass}
        title={t('Add media', { defaultValue: 'Add media' })}
        aria-label={t('Add media', { defaultValue: 'Add media' })}
      >
        <ImageUp />
      </Button>
    </Uploader>
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
                <span className="hidden">
                  <PostRelaySelector
                    parentEvent={parentEvent}
                    openFrom={openFrom}
                    mobileCompact
                    setIsProtectedEvent={setIsProtectedEvent!}
                    setAdditionalRelayUrls={setAdditionalRelayUrls!}
                  />
                </span>
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
              <div className="hidden">
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
                show={false}
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
          <div className="hidden">
            <Mentions
              content={text}
              parentEvent={parentEvent}
              mentions={mentions}
              setMentions={setMentions}
            />
          </div>
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
        show={false}
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

function getNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

function roundDurationMs(startedAt: number) {
  return Math.round((getNowMs() - startedAt) * 10) / 10
}
