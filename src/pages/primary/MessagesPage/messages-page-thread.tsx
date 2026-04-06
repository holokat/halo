import AudioPlayer from '@/components/AudioPlayer'
import Content from '@/components/Content'
import Emoji from '@/components/Emoji'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import SuggestedEmojis from '@/components/SuggestedEmojis'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerOverlay,
  DrawerTitle
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks/useFetchProfile'
import { useSecondaryPage } from '@/PageManager'
import { useMessages, TDirectMessageReaction, TMessageConversation } from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { SimpleUsername } from '@/components/Username'
import { formatUserId, pubkeyToNpub } from '@/lib/pubkey'
import { cn } from '@/lib/utils'
import { TDirectMessage } from '@/providers/MessagesProvider'
import { TEmoji } from '@/types'
import { Info, Loader, MessageCircle, SmilePlus } from 'lucide-react'
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConversationComposer } from './messages-page-composer'
import {
  MAX_VISIBLE_MESSAGES,
  summarizeMessageReactions,
  toConversationId,
  toRenderableConversationEvent,
  useRenderableMessageContent
} from './messages-page.utils'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker'))

function EmojiPickerFallback() {
  return (
    <div className="h-[320px] w-[320px] p-4">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 28 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-8 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export function ConversationThreadView({
  conversation,
  draftRecipientPubkeys,
  onOpenCompose,
  onSent
}: {
  conversation: TMessageConversation | null
  draftRecipientPubkeys: string[]
  onOpenCompose: () => void
  onSent: () => void
}) {
  const { t } = useTranslation()
  const visibleMessages = useMemo(
    () => conversation?.messages.slice(-MAX_VISIBLE_MESSAGES) ?? [],
    [conversation]
  )
  const recipientPubkeys = conversation?.participantPubkeys ?? draftRecipientPubkeys
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null)
  const previousThreadKeyRef = useRef<string | null>(null)
  const threadKey = conversation?.id ?? (draftRecipientPubkeys.length > 0 ? toConversationId(draftRecipientPubkeys) : null)
  const lastVisibleMessageKey = visibleMessages[visibleMessages.length - 1]?.wrapId ?? null

  useEffect(() => {
    if (!threadKey) {
      return
    }

    const isNewThread = previousThreadKeyRef.current !== threadKey
    previousThreadKeyRef.current = threadKey

    window.requestAnimationFrame(() => {
      bottomAnchorRef.current?.scrollIntoView({
        behavior: isNewThread ? 'auto' : 'smooth',
        block: 'end'
      })
    })
  }, [lastVisibleMessageKey, threadKey])

  if (recipientPubkeys.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-12 text-center">
        <div className="text-base font-semibold">{t('Conversation not found')}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pick another conversation or start a new message.')}
        </p>
        <Button onClick={onOpenCompose} className="mt-4">
          <MessageCircle />
          {t('Compose')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-9.5rem)] flex-col">
      <div className="flex-1 space-y-4 pb-32">
        {recipientPubkeys.length > 1 && (
          <ConversationParticipantsSummary
            participantPubkeys={recipientPubkeys}
            subject={conversation?.subject}
            isDraft={!conversation}
          />
        )}
        {visibleMessages.length > 0 ? (
          <div className="space-y-3">
            {conversation && conversation.messages.length > MAX_VISIBLE_MESSAGES && (
              <div className="text-xs text-muted-foreground">
                {t('Showing the latest {{count}} messages.', { count: MAX_VISIBLE_MESSAGES })}
              </div>
            )}
            <div className="space-y-2">
              {visibleMessages.map((message) => (
                <MessageBubble
                  key={message.wrapId}
                  conversation={conversation}
                  message={message}
                  recipientPubkeys={recipientPubkeys}
                  reactions={conversation?.reactionsByMessageId[message.id] ?? []}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border px-4 py-12 text-center">
            <div className="text-base font-semibold">{t('No messages yet')}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Write the first message below to start the conversation.')}
            </p>
          </div>
        )}
        <div ref={bottomAnchorRef} />
      </div>

      <div
        className="-mx-4 -mb-4 sticky bottom-0 mt-auto border-t bg-background/95 px-4 pt-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <ConversationComposer
          recipientPubkeys={recipientPubkeys}
          subject={conversation?.subject}
          replyToId={conversation?.messages[conversation.messages.length - 1]?.id}
          placeholder={
            conversation?.messages.length
              ? t('Write a reply...')
              : t('Write your first message...')
          }
          submitLabel={conversation?.messages.length ? t('Send reply') : t('Send message')}
          onSent={onSent}
        />
      </div>
    </div>
  )
}

export function ConversationAvatar({
  conversation,
  draftRecipientPubkeys,
  size = 'medium'
}: {
  conversation?: TMessageConversation | null
  draftRecipientPubkeys?: string[]
  size?: 'medium' | 'small'
}) {
  const participantPubkeys = conversation?.participantPubkeys ?? draftRecipientPubkeys ?? []
  const pubkey = conversation?.primaryPubkey ?? participantPubkeys[0]

  if (!pubkey) {
    return (
      <div className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <MessageCircle className="size-4" />
      </div>
    )
  }

  if (participantPubkeys.length > 1 || conversation?.isGroup) {
    return <ConversationAvatarStack participantPubkeys={participantPubkeys} size={size} />
  }

  return <SimpleUserAvatar userId={pubkey} size={size === 'small' ? 'small' : 'medium'} />
}

export function ConversationTitle({
  conversation,
  draftRecipientPubkeys,
  className
}: {
  conversation?: TMessageConversation | null
  draftRecipientPubkeys?: string[]
  className?: string
}) {
  const { t } = useTranslation()
  const participantPubkeys = conversation?.participantPubkeys ?? draftRecipientPubkeys ?? []

  if (participantPubkeys.length > 1 || conversation?.isGroup) {
    return (
      <GroupConversationTitle
        participantPubkeys={participantPubkeys}
        className={className}
        fallbackLabel={t('Group conversation', { defaultValue: 'Group conversation' })}
      />
    )
  }

  if (conversation?.primaryPubkey) {
    return <SimpleUsername userId={conversation.primaryPubkey} className={className} />
  }

  if (participantPubkeys[0]) {
    return <SimpleUsername userId={participantPubkeys[0]} className={className} />
  }

  return <div className={className}>{t('Messages')}</div>
}

export function ParticipantDisplayName({
  pubkey,
  className
}: {
  pubkey: string
  className?: string
}) {
  const { profile } = useFetchProfile(pubkey)

  return <span className={className}>{profile?.username || formatUserId(pubkey)}</span>
}

function ConversationAvatarStack({
  participantPubkeys,
  size = 'medium'
}: {
  participantPubkeys: string[]
  size?: 'medium' | 'small'
}) {
  const visiblePubkeys = participantPubkeys.slice(0, 3)
  const extraCount = Math.max(participantPubkeys.length - visiblePubkeys.length, 0)
  const avatarSizeClass = size === 'small' ? 'h-6 w-6' : 'h-8 w-8'
  const countSizeClass = size === 'small' ? 'h-7 min-w-7 text-[10px]' : 'h-8 min-w-8 text-[11px]'

  return (
    <div className="flex shrink-0 items-center -space-x-2">
      {visiblePubkeys.map((participantPubkey, index) => (
        <SimpleUserAvatar
          key={participantPubkey}
          userId={participantPubkey}
          size={size === 'small' ? 'xSmall' : 'compact'}
          className={cn('ring-2 ring-background', avatarSizeClass, index > 0 && 'relative z-[1]')}
        />
      ))}
      {extraCount > 0 && (
        <div
          className={cn(
            'relative z-[1] inline-flex items-center justify-center rounded-full border border-border bg-muted font-medium text-muted-foreground ring-2 ring-background',
            countSizeClass
          )}
        >
          +{extraCount}
        </div>
      )}
    </div>
  )
}

function GroupConversationTitle({
  participantPubkeys,
  className,
  fallbackLabel
}: {
  participantPubkeys: string[]
  className?: string
  fallbackLabel: string
}) {
  const visiblePubkeys = participantPubkeys.slice(0, 3)
  const extraCount = Math.max(participantPubkeys.length - visiblePubkeys.length, 0)

  if (visiblePubkeys.length === 0) {
    return <div className={className}>{fallbackLabel}</div>
  }

  return (
    <div className={cn('min-w-0 truncate', className)}>
      {visiblePubkeys.map((participantPubkey, index) => (
        <Fragment key={participantPubkey}>
          {index > 0 && <span>, </span>}
          <ParticipantDisplayName pubkey={participantPubkey} className="inline" />
        </Fragment>
      ))}
      {extraCount > 0 && <span>{` +${extraCount}`}</span>}
    </div>
  )
}

function ConversationParticipantsSummary({
  participantPubkeys,
  subject,
  isDraft
}: {
  participantPubkeys: string[]
  subject?: string
  isDraft: boolean
}) {
  const { t } = useTranslation()
  const totalParticipants = participantPubkeys.length + 1
  const summaryText = isDraft
    ? t('Your new group will include {{count}} people total.', {
        defaultValue: 'Your new group will include {{count}} people total.',
        count: totalParticipants
      })
    : t('{{count}} people are in this chat.', {
        defaultValue: '{{count}} people are in this chat.',
        count: totalParticipants
      })

  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <ConversationAvatarStack participantPubkeys={participantPubkeys} />
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {subject?.trim()
                  ? subject
                  : t('Group chat', { defaultValue: 'Group chat' })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{summaryText}</div>
            </div>
          </div>
        </div>
        <ConversationParticipantsDialog participantPubkeys={participantPubkeys} />
      </div>
    </div>
  )
}

function ConversationParticipantsDialog({
  participantPubkeys
}: {
  participantPubkeys: string[]
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { isSmallScreen } = useScreenSize()
  const [open, setOpen] = useState(false)
  const allParticipantPubkeys = useMemo(
    () => Array.from(new Set([pubkey, ...participantPubkeys].filter(Boolean))) as string[],
    [participantPubkeys, pubkey]
  )

  const content = (
    <div className="space-y-3">
      {allParticipantPubkeys.map((participantPubkey) => (
        <ConversationParticipantRow
          key={participantPubkey}
          participantPubkey={participantPubkey}
          isYou={participantPubkey === pubkey}
          onOpenProfile={() => setOpen(false)}
        />
      ))}
    </div>
  )

  if (isSmallScreen) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <Info className="size-4" />
          {t('Members', { defaultValue: 'Members' })}
        </Button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerOverlay onClick={() => setOpen(false)} />
          <DrawerContent hideOverlay className="px-4 pb-4">
            <DrawerHeader className="px-0">
              <DrawerTitle>{t('Group members', { defaultValue: 'Group members' })}</DrawerTitle>
              <DrawerDescription>
                {t('Everyone currently included in this chat.', {
                  defaultValue: 'Everyone currently included in this chat.'
                })}
              </DrawerDescription>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        <Info className="size-4" />
        {t('Members', { defaultValue: 'Members' })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Group members', { defaultValue: 'Group members' })}</DialogTitle>
            <DialogDescription>
              {t('Everyone currently included in this chat.', {
                defaultValue: 'Everyone currently included in this chat.'
              })}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConversationParticipantRow({
  participantPubkey,
  isYou,
  onOpenProfile
}: {
  participantPubkey: string
  isYou: boolean
  onOpenProfile?: () => void
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { profile } = useFetchProfile(participantPubkey)
  const secondaryText = profile?.nip05 || profile?.npub || formatUserId(participantPubkey)
  const profileId = pubkeyToNpub(participantPubkey) || participantPubkey

  const handleOpenProfile = () => {
    onOpenProfile?.()
    push(`/users/${profileId}`)
  }

  return (
    <button
      type="button"
      onClick={handleOpenProfile}
      className="flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left transition-colors hover:bg-accent/60"
    >
      <SimpleUserAvatar userId={participantPubkey} size="small" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {isYou ? t('You', { defaultValue: 'You' }) : profile?.username || formatUserId(participantPubkey)}
        </div>
        <div className="truncate text-xs text-muted-foreground">{secondaryText}</div>
      </div>
      {isYou && (
        <Badge variant="secondary" className="shrink-0">
          {t('You', { defaultValue: 'You' })}
        </Badge>
      )}
    </button>
  )
}

function MessageBubble({
  conversation,
  message,
  recipientPubkeys,
  reactions
}: {
  conversation: TMessageConversation | null
  message: NonNullable<TMessageConversation['messages'][number]>
  recipientPubkeys: string[]
  reactions: TDirectMessageReaction[]
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const showSender = !!conversation?.isGroup && !message.isOutgoing
  const showSenderAvatar = !!conversation?.isGroup && !message.isOutgoing
  const reactionSummaries = useMemo(
    () => summarizeMessageReactions(reactions, pubkey),
    [pubkey, reactions]
  )
  const {
    renderableContent,
    isDecrypting,
    hasDecryptError,
    isEncryptedFileMessage,
    isFileMessage,
    encryptedFileType
  } = useRenderableMessageContent(message)
  const renderableEvent = useMemo(
    () => toRenderableConversationEvent(message, renderableContent),
    [message, renderableContent]
  )

  return (
    <div
      className={cn(
        'group flex w-full items-end gap-2',
        message.isOutgoing ? 'justify-end' : 'justify-start'
      )}
    >
      {showSenderAvatar && (
        <SimpleUserAvatar
          userId={message.senderPubkey}
          size="small"
          className="mt-0.5 shrink-0 self-start"
        />
      )}
      {!message.isOutgoing && !showSenderAvatar && (
        <MessageReactionPicker message={message} recipientPubkeys={recipientPubkeys} />
      )}
      <div className="max-w-[85%]">
        <div
          className={cn(
            'rounded-2xl px-3 py-2 space-y-1',
            message.isOutgoing
              ? 'bg-primary text-primary-foreground'
              : conversation?.isRequest
                ? 'border border-amber-500/20 bg-amber-500/10'
                : 'bg-muted'
          )}
        >
          {showSender && (
            <div className="text-xs opacity-70">
              <SimpleUsername userId={message.senderPubkey} />
            </div>
          )}
          {isFileMessage && isEncryptedFileMessage && isDecrypting ? (
            <div className="flex items-center gap-2 text-xs opacity-80">
              <Loader className="size-3.5 animate-spin" />
              <span>
                {t('Decrypting attachment...', {
                  defaultValue: 'Decrypting attachment...'
                })}
              </span>
            </div>
          ) : isFileMessage && isEncryptedFileMessage && hasDecryptError ? (
            <div className="text-xs opacity-80">
              {t('Unable to decrypt attachment', {
                defaultValue: 'Unable to decrypt attachment'
              })}
            </div>
          ) : isFileMessage && encryptedFileType?.startsWith('image/') && renderableContent ? (
            <img
              src={renderableContent}
              alt={t('Attachment', { defaultValue: 'Attachment' })}
              className="mt-1 max-h-72 w-full rounded-lg object-cover"
              loading="lazy"
            />
          ) : isFileMessage && encryptedFileType?.startsWith('video/') && renderableContent ? (
            <video
              src={renderableContent}
              controls
              className="mt-1 max-h-80 w-full rounded-lg bg-black/20"
            />
          ) : isFileMessage && encryptedFileType?.startsWith('audio/') && renderableContent ? (
            <AudioPlayer src={renderableContent} className="mt-1" />
          ) : isFileMessage && renderableContent ? (
            <a
              href={renderableContent}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="text-sm underline underline-offset-2"
            >
              {t('Open attachment', { defaultValue: 'Open attachment' })}
            </a>
          ) : (
            <Content
              event={renderableEvent}
              className="text-sm whitespace-pre-wrap break-words"
              mustLoadMedia
            />
          )}
          <div className="text-[11px] opacity-70">
            <FormattedTimestamp timestamp={message.createdAt} short />
          </div>
        </div>
        {reactionSummaries.length > 0 && (
          <div
            className={cn(
              'mt-[-0.4rem] flex flex-wrap gap-1 px-2',
              message.isOutgoing ? 'justify-end' : 'justify-start'
            )}
          >
            {reactionSummaries.map((reaction) => (
              <div
                key={reaction.emoji}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1 rounded-full border border-border/80 bg-card px-2 py-0.5 text-xs shadow-sm',
                  reaction.isMine && 'border-primary/30 bg-primary/5'
                )}
              >
                <Emoji emoji={reaction.emoji} classNames={{ text: 'text-sm leading-none' }} />
                {reaction.count > 1 && <span className="font-medium">{reaction.count}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {!message.isOutgoing && showSenderAvatar && (
        <MessageReactionPicker message={message} recipientPubkeys={recipientPubkeys} />
      )}
    </div>
  )
}

function MessageReactionPicker({
  message,
  recipientPubkeys
}: {
  message: TDirectMessage
  recipientPubkeys: string[]
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { checkLogin } = useNostr()
  const { sendReaction } = useMessages()
  const [isOpen, setIsOpen] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const triggerClassName = cn(
    'mt-2 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition',
    'opacity-80 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
    isSending && 'opacity-100 text-foreground'
  )

  if (message.isOutgoing) {
    return null
  }

  const handleReaction = (emoji: string | TEmoji) => {
    checkLogin(async () => {
      if (isSending) {
        return
      }

      if (typeof emoji !== 'string') {
        toast.error(
          t('Custom emoji reactions are not supported in direct messages yet.', {
            defaultValue: 'Custom emoji reactions are not supported in direct messages yet.'
          })
        )
        return
      }

      setIsSending(true)

      try {
        await sendReaction(recipientPubkeys, message, emoji)
        setIsOpen(false)
        setIsPickerOpen(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('Failed to send reaction'))
      } finally {
        setIsSending(false)
      }
    })
  }

  if (isSmallScreen) {
    return (
      <>
        <button
          type="button"
          className={triggerClassName}
          onClick={(event) => {
            event.stopPropagation()
            setIsOpen(true)
            setIsPickerOpen(false)
          }}
          disabled={isSending}
          aria-label={t('React')}
          title={t('React')}
        >
          {isSending ? <Loader className="size-4 animate-spin" /> : <SmilePlus className="size-4" />}
        </button>
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerOverlay onClick={() => setIsOpen(false)} />
          <DrawerContent hideOverlay>
            {isPickerOpen ? (
              <Suspense fallback={<EmojiPickerFallback />}>
                <EmojiPicker
                  showFavorites
                  onEmojiClick={(emoji) => {
                    if (!emoji) return
                    handleReaction(emoji)
                  }}
                />
              </Suspense>
            ) : (
              <div className="px-3 pb-4 pt-1">
                <SuggestedEmojis
                  onEmojiClick={handleReaction}
                  onMoreButtonClick={() => setIsPickerOpen(true)}
                />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) {
          setIsPickerOpen(false)
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={t('React')}
          title={t('React')}
          disabled={isSending}
          onClick={(event) => event.stopPropagation()}
        >
          {isSending ? <Loader className="size-4 animate-spin" /> : <SmilePlus className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={message.isOutgoing ? 'end' : 'start'} className="w-fit p-0">
        {isPickerOpen ? (
          <Suspense fallback={<EmojiPickerFallback />}>
            <EmojiPicker
              onEmojiClick={(emoji) => {
                if (!emoji) return
                handleReaction(emoji)
              }}
            />
          </Suspense>
        ) : (
          <SuggestedEmojis
            onEmojiClick={handleReaction}
            onMoreButtonClick={() => setIsPickerOpen(true)}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
