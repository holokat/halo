import AlertCard from '@/components/AlertCard'
import SearchInput from '@/components/SearchInput'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import { useSearchProfiles } from '@/hooks/useSearchProfiles'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { cn } from '@/lib/utils'
import { useMessages, TMessageConversation } from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TProfile, TPageRef } from '@/types'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  CheckCheck,
  EyeOff,
  Inbox,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  SendHorizontal,
  Users
} from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const MAX_VISIBLE_MESSAGES = 50

type TOverviewTab = 'conversations' | 'requests'
type TMessagesViewMode = 'index' | 'compose' | 'thread'

function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

function findDirectConversationByPubkey(
  conversations: TMessageConversation[],
  pubkey: string
) {
  return conversations.find(
    (conversation) =>
      conversation.participantPubkeys.length === 1 && conversation.primaryPubkey === pubkey
  )
}

const MessagesPage = forwardRef(({ composeTo }: { composeTo?: string | null }, ref) => {
  const { t } = useTranslation()
  const layoutRef = useRef<TPageRef>(null)
  const previousComposeToRef = useRef<string | null | undefined>(composeTo)
  const { pubkey, startLogin } = useNostr()
  const {
    conversations,
    activeConversations,
    requests,
    isLoading,
    hasLoadedMessages,
    isSupported,
    hasUnreadMessages,
    unreadMessageCount,
    markAllAsRead,
    markConversationAsRead,
    dismissConversation
  } = useMessages()
  const [activeTab, setActiveTab] = useState<TOverviewTab>('conversations')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [draftRecipientPubkey, setDraftRecipientPubkey] = useState<string | null>(null)
  const [isComposePickerOpen, setIsComposePickerOpen] = useState(false)
  const [composeQuery, setComposeQuery] = useState('')
  const [debouncedComposeQuery, setDebouncedComposeQuery] = useState('')
  const { profiles: composeProfiles, isFetching: isFetchingComposeProfiles } = useSearchProfiles(
    debouncedComposeQuery,
    8
  )

  useImperativeHandle(ref, () => layoutRef.current as TPageRef)

  const allConversations = useMemo(() => conversations, [conversations])

  const selectedConversation = useMemo(
    () =>
      selectedConversationId
        ? allConversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : null,
    [allConversations, selectedConversationId]
  )

  const viewMode: TMessagesViewMode = selectedConversationId || draftRecipientPubkey
    ? 'thread'
    : isComposePickerOpen
      ? 'compose'
      : 'index'

  const visibleConversations = activeTab === 'conversations' ? activeConversations : requests

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedComposeQuery(composeQuery.trim())
    }, 300)

    return () => {
      window.clearTimeout(handler)
    }
  }, [composeQuery])

  useEffect(() => {
    if (selectedConversationId && !selectedConversation) {
      setSelectedConversationId(null)
    }
  }, [selectedConversation, selectedConversationId])

  useEffect(() => {
    if (selectedConversation && !selectedConversation.isRequest && activeTab === 'requests') {
      setActiveTab('conversations')
    }
  }, [activeTab, selectedConversation])

  useEffect(() => {
    if (composeTo === previousComposeToRef.current) {
      return
    }

    previousComposeToRef.current = composeTo

    if (!composeTo) {
      setSelectedConversationId(null)
      setDraftRecipientPubkey(null)
      setIsComposePickerOpen(false)
      return
    }

    const matchingConversation = findDirectConversationByPubkey(allConversations, composeTo)

    if (matchingConversation) {
      setActiveTab(matchingConversation.isRequest ? 'requests' : 'conversations')
      setSelectedConversationId(matchingConversation.id)
      setDraftRecipientPubkey(null)
      setIsComposePickerOpen(false)
      return
    }

    setSelectedConversationId(null)
    setDraftRecipientPubkey(composeTo)
    setIsComposePickerOpen(false)
  }, [allConversations, composeTo])

  const openConversation = (conversation: TMessageConversation) => {
    setActiveTab(conversation.isRequest ? 'requests' : 'conversations')
    setSelectedConversationId(conversation.id)
    setDraftRecipientPubkey(null)
    setIsComposePickerOpen(false)
    markConversationAsRead(conversation.id)
  }

  const handleOpenCompose = () => {
    setComposeQuery('')
    setDebouncedComposeQuery('')
    setDraftRecipientPubkey(null)
    setSelectedConversationId(null)
    setIsComposePickerOpen(true)
  }

  const handleBack = () => {
    setSelectedConversationId(null)
    setDraftRecipientPubkey(null)
    setIsComposePickerOpen(false)
  }

  const handleSelectProfile = (profile: TProfile) => {
    const matchingConversation = findDirectConversationByPubkey(allConversations, profile.pubkey)

    if (matchingConversation) {
      openConversation(matchingConversation)
      return
    }

    setDraftRecipientPubkey(profile.pubkey)
    setSelectedConversationId(null)
    setIsComposePickerOpen(false)
  }

  return (
    <PrimaryPageLayout
      ref={layoutRef}
      pageName="messages"
      titlebar={
        <MessagesPageTitlebar
          viewMode={viewMode}
          conversation={selectedConversation}
          draftRecipientPubkey={draftRecipientPubkey}
          unreadMessageCount={unreadMessageCount}
          hasUnreadMessages={hasUnreadMessages}
          onBack={handleBack}
          onCompose={handleOpenCompose}
          onMarkAllAsRead={markAllAsRead}
        />
      }
      displayScrollToTopButton
      hideBottomSpacer
    >
      <div className="px-4 py-4 space-y-4">
        {!pubkey && (
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <MessageCircle className="text-muted-foreground" />
                <span>{t('Messages')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('Log in to load your direct messages and message requests.')}
              </p>
              <Button className="w-fit" onClick={startLogin}>
                {t('Log in')}
              </Button>
            </CardContent>
          </Card>
        )}

        {pubkey && !isSupported && (
          <AlertCard
            title={t('Messages unavailable')}
            content={t('Direct messages need a signer that can decrypt NIP-17 gift wraps.')}
          />
        )}

        {pubkey && isSupported && viewMode === 'index' && (
          <MessagesOverview
            activeTab={activeTab}
            onTabChange={setActiveTab}
            conversations={activeConversations}
            requests={requests}
            visibleConversations={visibleConversations}
            isLoading={isLoading}
            hasLoadedMessages={hasLoadedMessages}
            onMarkConversationAsRead={markConversationAsRead}
            onDismissConversation={dismissConversation}
            onOpenConversation={openConversation}
          />
        )}

        {pubkey && isSupported && viewMode === 'compose' && (
          <ComposeMessageView
            query={composeQuery}
            onQueryChange={setComposeQuery}
            profiles={composeProfiles}
            isFetching={isFetchingComposeProfiles}
            onSelectProfile={handleSelectProfile}
          />
        )}

        {pubkey && isSupported && viewMode === 'thread' && (
          <ConversationThreadView
            conversation={selectedConversation}
            draftRecipientPubkey={draftRecipientPubkey}
            onOpenCompose={handleOpenCompose}
            onSent={() => {
              if (draftRecipientPubkey) {
                setSelectedConversationId(toConversationId([draftRecipientPubkey]))
                setDraftRecipientPubkey(null)
                setActiveTab('conversations')
              }
            }}
          />
        )}
      </div>
    </PrimaryPageLayout>
  )
})

MessagesPage.displayName = 'MessagesPage'

export default MessagesPage

function MessagesPageTitlebar({
  viewMode,
  conversation,
  draftRecipientPubkey,
  unreadMessageCount,
  hasUnreadMessages,
  onBack,
  onCompose,
  onMarkAllAsRead
}: {
  viewMode: TMessagesViewMode
  conversation: TMessageConversation | null
  draftRecipientPubkey: string | null
  unreadMessageCount: number
  hasUnreadMessages: boolean
  onBack: () => void
  onCompose: () => void
  onMarkAllAsRead: () => void
}) {
  const { t } = useTranslation()

  if (viewMode === 'thread') {
    return (
      <div className="flex items-center h-full pl-1 pr-2 gap-2">
        <Button variant="ghost" size="titlebar-icon" onClick={onBack} aria-label={t('Back')}>
          <ArrowLeft />
        </Button>
        <ConversationAvatar conversation={conversation} draftRecipientPubkey={draftRecipientPubkey} size="small" />
        <div className="min-w-0 flex-1">
          {conversation ? (
            <ConversationTitle conversation={conversation} className="text-lg font-semibold truncate" />
          ) : draftRecipientPubkey ? (
            <SimpleUsername
              userId={draftRecipientPubkey}
              className="text-lg font-semibold truncate"
            />
          ) : (
            <div className="text-lg font-semibold truncate">{t('Messages')}</div>
          )}
        </div>
        {conversation?.isRequest && (
          <Badge variant="outline" className="shrink-0">
            {t('Request')}
          </Badge>
        )}
      </div>
    )
  }

  if (viewMode === 'compose') {
    return (
      <div className="flex items-center h-full pl-1 pr-2 gap-2">
        <Button variant="ghost" size="titlebar-icon" onClick={onBack} aria-label={t('Back')}>
          <ArrowLeft />
        </Button>
        <div className="text-lg font-semibold truncate" style={{ fontSize: 'var(--title-font-size, 18px)' }}>
          {t('New message')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between h-full pl-3 pr-2 gap-2">
      <div className="flex items-center gap-2 min-w-0 [&_svg]:text-muted-foreground">
        <MessagesSquare />
        <div className="text-lg font-semibold truncate" style={{ fontSize: 'var(--title-font-size, 18px)' }}>
          {t('Messages')}
        </div>
        {unreadMessageCount > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {unreadMessageCount}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onMarkAllAsRead}
          disabled={!hasUnreadMessages}
        >
          {t('Mark all as read')}
        </Button>
        <Button size="sm" className="shrink-0" onClick={onCompose}>
          <Plus />
          {t('New')}
        </Button>
      </div>
    </div>
  )
}

function MessagesOverview({
  activeTab,
  onTabChange,
  conversations,
  requests,
  visibleConversations,
  isLoading,
  hasLoadedMessages,
  onMarkConversationAsRead,
  onDismissConversation,
  onOpenConversation
}: {
  activeTab: TOverviewTab
  onTabChange: (tab: TOverviewTab) => void
  conversations: TMessageConversation[]
  requests: TMessageConversation[]
  visibleConversations: TMessageConversation[]
  isLoading: boolean
  hasLoadedMessages: boolean
  onMarkConversationAsRead: (conversationId: string) => void
  onDismissConversation: (conversationId: string) => void
  onOpenConversation: (conversation: TMessageConversation) => void
}) {
  const { t } = useTranslation()
  const hasAnyMessages = conversations.length > 0 || requests.length > 0
  const isCheckingForMessages = !hasLoadedMessages && !hasAnyMessages

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b">
        <OverviewTabButton
          label={t('Conversations')}
          active={activeTab === 'conversations'}
          onClick={() => onTabChange('conversations')}
        />
        <OverviewTabButton
          label={t('Requests')}
          active={activeTab === 'requests'}
          onClick={() => onTabChange('requests')}
        />
      </div>

      {isCheckingForMessages ? (
        <MessagesLoadingState />
      ) : isLoading && !hasAnyMessages ? (
        <MessagesLoadingState compact />
      ) : visibleConversations.length === 0 ? (
        <div className="rounded-xl border px-4 py-12 text-center">
          <Inbox className="mx-auto mb-3 text-muted-foreground" />
          <div className="text-lg font-semibold">
            {activeTab === 'conversations' ? t('No conversations yet') : t('No requests right now')}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === 'conversations'
              ? t('Start a new DM or wait for someone to message you.')
              : t('Incoming message requests will show up here.')}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {visibleConversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              onMarkAsRead={() => onMarkConversationAsRead(conversation.id)}
              onDismiss={() => onDismissConversation(conversation.id)}
              onClick={() => onOpenConversation(conversation)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OverviewTabButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-colors',
          active ? 'bg-primary' : 'bg-transparent'
        )}
      />
    </button>
  )
}

function ConversationRow({
  conversation,
  onMarkAsRead,
  onDismiss,
  onClick
}: {
  conversation: TMessageConversation
  onMarkAsRead: () => void
  onDismiss: () => void
  onClick: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-stretch gap-2 px-3 py-2 border-b last:border-b-0">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
        onClick={onClick}
      >
        <ConversationAvatar conversation={conversation} size="small" />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <ConversationTitle
            conversation={conversation}
            className="shrink-0 max-w-[40%] text-sm font-medium truncate"
          />
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {conversation.lastMessagePreview}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {conversation.unreadCount > 0 && <div className="size-2 rounded-full bg-primary" />}
          <FormattedTimestamp
            timestamp={conversation.lastMessageAt}
            short
            className="text-xs text-muted-foreground"
          />
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 size-8 shrink-0"
            aria-label={t('Message actions')}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {conversation.unreadCount > 0 && (
            <DropdownMenuItem onClick={onMarkAsRead}>
              <CheckCheck />
              {t('Mark as read')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDismiss}>
            <EyeOff />
            {conversation.isRequest ? t('Dismiss request') : t('Hide conversation')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function MessagesLoadingState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{t('Checking for messages...')}</div>
          {!compact && (
            <div className="text-xs text-muted-foreground mt-1">
              {t('Looking for conversations and requests on your inbox relays.')}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{t('Syncing')}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-2/5 rounded-full bg-primary animate-pulse" />
      </div>
      <div className="mt-4 rounded-xl border overflow-hidden">
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
      </div>
    </div>
  )
}

function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <Skeleton className="h-4 w-24 shrink-0" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-12 shrink-0" />
    </div>
  )
}

function ComposeMessageView({
  query,
  onQueryChange,
  profiles,
  isFetching,
  onSelectProfile
}: {
  query: string
  onQueryChange: (value: string) => void
  profiles: TProfile[]
  isFetching: boolean
  onSelectProfile: (profile: TProfile) => void
}) {
  const { t } = useTranslation()
  const hasQuery = !!query.trim()

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('Search people by name, nip05, or npub')}
      />

      {!hasQuery ? (
        <div className="rounded-xl border px-4 py-10 text-center">
          <div className="text-base font-semibold">{t('Start a new DM')}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Search for someone, then open a conversation and send your message.')}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {isFetching ? (
            <>
              <ComposeProfileRowSkeleton />
              <ComposeProfileRowSkeleton />
              <ComposeProfileRowSkeleton />
            </>
          ) : profiles.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t('No users found')}
            </div>
          ) : (
            profiles.map((profile) => (
              <button
                key={profile.pubkey}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 border-b last:border-b-0"
                onClick={() => onSelectProfile(profile)}
              >
                <SimpleUserAvatar userId={profile.pubkey} size="small" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{profile.username}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {profile.nip05 || profile.npub}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ComposeProfileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  )
}

function ConversationThreadView({
  conversation,
  draftRecipientPubkey,
  onOpenCompose,
  onSent
}: {
  conversation: TMessageConversation | null
  draftRecipientPubkey: string | null
  onOpenCompose: () => void
  onSent: () => void
}) {
  const { t } = useTranslation()
  const visibleMessages = useMemo(
    () => conversation?.messages.slice(-MAX_VISIBLE_MESSAGES) ?? [],
    [conversation]
  )
  const recipientPubkeys = conversation?.participantPubkeys ?? (draftRecipientPubkey ? [draftRecipientPubkey] : [])

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
    <div className="space-y-4">
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

      <Separator />

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
  )
}

function ConversationAvatar({
  conversation,
  draftRecipientPubkey,
  size = 'medium'
}: {
  conversation?: TMessageConversation | null
  draftRecipientPubkey?: string | null
  size?: 'medium' | 'small'
}) {
  const resolvedSize = size === 'small' ? 'small' : 'medium'

  if (conversation?.isGroup) {
    return (
      <div className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <Users className="size-4" />
      </div>
    )
  }

  const pubkey = conversation?.primaryPubkey ?? draftRecipientPubkey

  if (!pubkey) {
    return (
      <div className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <MessageCircle className="size-4" />
      </div>
    )
  }

  return <SimpleUserAvatar userId={pubkey} size={resolvedSize} />
}

function ConversationTitle({
  conversation,
  className
}: {
  conversation: TMessageConversation
  className?: string
}) {
  if (conversation.isGroup || !conversation.primaryPubkey) {
    return <div className={className}>Group conversation</div>
  }

  return <SimpleUsername userId={conversation.primaryPubkey} className={className} />
}

function MessageBubble({
  conversation,
  message
}: {
  conversation: TMessageConversation | null
  message: NonNullable<TMessageConversation['messages'][number]>
}) {
  const showSender = !!conversation?.isGroup && !message.isOutgoing

  return (
    <div className={cn('flex', message.isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 space-y-1',
          message.isOutgoing
            ? 'bg-primary text-primary-foreground'
            : conversation?.isRequest
              ? 'bg-amber-500/10 border border-amber-500/20'
              : 'bg-muted'
        )}
      >
        {showSender && (
          <div className="text-xs opacity-70">
            <SimpleUsername userId={message.senderPubkey} />
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words">{message.content || ' '}</div>
        <div className="text-[11px] opacity-70">
          <FormattedTimestamp timestamp={message.createdAt} short />
        </div>
      </div>
    </div>
  )
}

function ConversationComposer({
  recipientPubkeys,
  subject,
  replyToId,
  placeholder,
  submitLabel,
  onSent
}: {
  recipientPubkeys: string[]
  subject?: string
  replyToId?: string
  placeholder: string
  submitLabel: string
  onSent?: () => void
}) {
  const { t } = useTranslation()
  const { sendMessage } = useMessages()
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSend = async () => {
    const trimmedContent = content.trim()

    if (!trimmedContent || isSending) {
      return
    }

    setIsSending(true)

    try {
      await sendMessage(recipientPubkeys, trimmedContent, { replyToId, subject })
      setContent('')
      onSent?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to send message')
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        className="min-h-[112px]"
      />
      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={!content.trim() || isSending}>
          <SendHorizontal />
          {isSending ? t('Sending...') : submitLabel}
        </Button>
      </div>
    </div>
  )
}
