import AlertCard from '@/components/AlertCard'
import Content from '@/components/Content'
import Emoji from '@/components/Emoji'
import Uploader from '@/components/PostEditor/Uploader'
import SearchInput from '@/components/SearchInput'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import SuggestedEmojis from '@/components/SuggestedEmojis'
import { useFetchProfile } from '@/hooks/useFetchProfile'
import { useSearchProfiles } from '@/hooks/useSearchProfiles'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import ZapDialog from '@/components/ZapDialog'
import { usePaymentsEnabled } from '@/providers/PaymentsEnabledProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { formatUserId } from '@/lib/pubkey'
import { cn } from '@/lib/utils'
import { getLightningAddressFromProfile } from '@/lib/lightning'
import {
  useMessages,
  TDirectMessage,
  TDirectMessageReaction,
  TMessageConversation
} from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useZap } from '@/providers/ZapProvider'
import client from '@/services/client.service'
import lightning from '@/services/lightning.service'
import mediaUpload from '@/services/media-upload.service'
import { TEmoji, TPageRef, TProfile } from '@/types'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  ACTUAL_ZAP_SOUNDS,
  ZAP_SOUNDS
} from '@/constants'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  EyeOff,
  Inbox,
  Info,
  Loader,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  Paperclip,
  Plus,
  PlugZap,
  SendHorizontal,
  Users,
  X,
  Zap
} from 'lucide-react'
import {
  MouseEvent,
  TouchEvent,
  forwardRef,
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { Event } from 'nostr-tools'

const MAX_VISIBLE_MESSAGES = 50

const EmojiPicker = lazy(() => import('@/components/EmojiPicker'))

type TOverviewTab = 'conversations' | 'requests'
type TMessagesViewMode = 'index' | 'compose' | 'thread'

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

function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

function playZapSound(zapSound: string, isWalletConnected: boolean) {
  if (!isWalletConnected || zapSound === ZAP_SOUNDS.NONE) {
    return
  }

  let soundToPlay = zapSound

  if (zapSound === ZAP_SOUNDS.RANDOM) {
    const randomIndex = Math.floor(Math.random() * ACTUAL_ZAP_SOUNDS.length)
    soundToPlay = ACTUAL_ZAP_SOUNDS[randomIndex]
  }

  const audio = new Audio(`/sounds/${soundToPlay}.mp3`)
  audio.volume = 0.5
  audio.play().catch(() => {
    // Ignore autoplay policy or transient playback errors.
  })
}

function calculateChargeZapAmount(holdDuration: number, limit: number): number {
  let amount = 0

  if (holdDuration <= 500) {
    amount = Math.floor(holdDuration / 100)
  } else if (holdDuration <= 1500) {
    amount = 5 + Math.floor((holdDuration - 500) / 50)
  } else if (holdDuration <= 3000) {
    amount = 25 + Math.floor((holdDuration - 1500) / 20)
  } else {
    amount = 100 + Math.floor((holdDuration - 3000) / 10)
  }

  return Math.min(amount, limit)
}

function fireChargeZapConfetti(element: HTMLElement, amount: number, limit: number) {
  const rect = element.getBoundingClientRect()
  const x = (rect.left + rect.width / 2) / window.innerWidth
  const y = (rect.top + rect.height / 2) / window.innerHeight
  const intensity = amount / limit
  const particleCount = Math.floor(30 + intensity * 120)
  const spread = 60 + intensity * 60

  confetti({
    particleCount,
    spread,
    origin: { x, y },
    colors: ['#FFD700', '#FFA500', '#FF8C00', '#FFFF00', '#FFE55C'],
    ticks: 200,
    gravity: 1.2,
    decay: 0.94,
    startVelocity: 20 + intensity * 30,
    scalar: 0.8 + intensity * 0.7
  })
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

function normalizeRecipientPubkeys(pubkeys: string[], accountPubkey?: string | null) {
  return Array.from(new Set(pubkeys.map((pubkey) => pubkey.trim()).filter(Boolean))).filter(
    (pubkey) => pubkey !== accountPubkey
  )
}

function findConversationByParticipants(
  conversations: TMessageConversation[],
  participantPubkeys: string[]
) {
  if (participantPubkeys.length === 0) {
    return null
  }

  const conversationId = toConversationId(participantPubkeys)
  return conversations.find((conversation) => conversation.id === conversationId) ?? null
}

type TReactionSummary = {
  emoji: string
  count: number
  isMine: boolean
  lastCreatedAt: number
}

type TComposerAttachment = {
  url: string
  imetaTag?: string[]
}

type TUploadProgressItem = {
  file: File
  progress: number
  cancel: () => void
}

function summarizeMessageReactions(
  reactions: TDirectMessageReaction[],
  accountPubkey?: string | null
) {
  const latestReactionBySender = new Map<string, TDirectMessageReaction>()

  reactions
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))
    .forEach((reaction) => {
      latestReactionBySender.set(reaction.senderPubkey, reaction)
    })

  const summaries = new Map<string, TReactionSummary>()

  Array.from(latestReactionBySender.values()).forEach((reaction) => {
    const existingSummary = summaries.get(reaction.emoji)

    if (existingSummary) {
      summaries.set(reaction.emoji, {
        ...existingSummary,
        count: existingSummary.count + 1,
        isMine: existingSummary.isMine || reaction.senderPubkey === accountPubkey,
        lastCreatedAt: Math.max(existingSummary.lastCreatedAt, reaction.createdAt)
      })
      return
    }

    summaries.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: 1,
      isMine: reaction.senderPubkey === accountPubkey,
      lastCreatedAt: reaction.createdAt
    })
  })

  return Array.from(summaries.values()).sort((a, b) => a.lastCreatedAt - b.lastCreatedAt)
}

function toRenderableConversationEvent(message: TDirectMessage) {
  return {
    id: message.id,
    pubkey: message.senderPubkey,
    created_at: message.createdAt,
    kind: message.kind,
    tags: message.tags,
    content: message.content
  } as Event
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
  const [draftRecipientPubkeys, setDraftRecipientPubkeys] = useState<string[]>([])
  const [isComposePickerOpen, setIsComposePickerOpen] = useState(false)
  const [composeRecipientPubkeys, setComposeRecipientPubkeys] = useState<string[]>([])
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

  const viewMode: TMessagesViewMode = selectedConversationId || draftRecipientPubkeys.length > 0
    ? 'thread'
    : isComposePickerOpen
      ? 'compose'
      : 'index'

  const normalizedComposeRecipientPubkeys = useMemo(
    () => normalizeRecipientPubkeys(composeRecipientPubkeys, pubkey),
    [composeRecipientPubkeys, pubkey]
  )

  const matchingComposeConversation = useMemo(
    () => findConversationByParticipants(allConversations, normalizedComposeRecipientPubkeys),
    [allConversations, normalizedComposeRecipientPubkeys]
  )

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
      setDraftRecipientPubkeys([])
      setComposeRecipientPubkeys([])
      setIsComposePickerOpen(false)
      return
    }

    const matchingConversation = findDirectConversationByPubkey(allConversations, composeTo)

    if (matchingConversation) {
      setActiveTab(matchingConversation.isRequest ? 'requests' : 'conversations')
      setSelectedConversationId(matchingConversation.id)
      setDraftRecipientPubkeys([])
      setComposeRecipientPubkeys([])
      setIsComposePickerOpen(false)
      return
    }

    setSelectedConversationId(null)
    setDraftRecipientPubkeys([composeTo])
    setComposeRecipientPubkeys([])
    setIsComposePickerOpen(false)
  }, [allConversations, composeTo])

  const openConversation = (conversation: TMessageConversation) => {
    setActiveTab(conversation.isRequest ? 'requests' : 'conversations')
    setSelectedConversationId(conversation.id)
    setDraftRecipientPubkeys([])
    setComposeRecipientPubkeys([])
    setIsComposePickerOpen(false)
    markConversationAsRead(conversation.id)
  }

  const handleOpenCompose = () => {
    setComposeQuery('')
    setDebouncedComposeQuery('')
    setDraftRecipientPubkeys([])
    setSelectedConversationId(null)
    setComposeRecipientPubkeys([])
    setIsComposePickerOpen(true)
  }

  const handleBack = () => {
    setSelectedConversationId(null)
    setDraftRecipientPubkeys([])
    setComposeRecipientPubkeys([])
    setIsComposePickerOpen(false)
  }

  const handleToggleComposeRecipient = (profile: TProfile) => {
    if (profile.pubkey === pubkey) {
      return
    }

    const isAlreadySelected = normalizedComposeRecipientPubkeys.includes(profile.pubkey)

    setComposeRecipientPubkeys((current) => {
      if (current.includes(profile.pubkey)) {
        return current.filter((item) => item !== profile.pubkey)
      }

      return [...current, profile.pubkey]
    })

    if (!isAlreadySelected) {
      setComposeQuery('')
      setDebouncedComposeQuery('')
    }
  }

  const handleRemoveComposeRecipient = (recipientPubkey: string) => {
    setComposeRecipientPubkeys((current) => current.filter((item) => item !== recipientPubkey))
  }

  const handleStartConversation = () => {
    if (normalizedComposeRecipientPubkeys.length === 0) {
      return
    }

    if (matchingComposeConversation) {
      openConversation(matchingComposeConversation)
      return
    }

    setSelectedConversationId(null)
    setDraftRecipientPubkeys(normalizedComposeRecipientPubkeys)
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
          draftRecipientPubkeys={draftRecipientPubkeys}
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
            accountPubkey={pubkey}
            query={composeQuery}
            onQueryChange={setComposeQuery}
            profiles={composeProfiles}
            isFetching={isFetchingComposeProfiles}
            selectedRecipientPubkeys={normalizedComposeRecipientPubkeys}
            matchingConversation={matchingComposeConversation}
            onToggleProfile={handleToggleComposeRecipient}
            onRemoveRecipient={handleRemoveComposeRecipient}
            onStartConversation={handleStartConversation}
          />
        )}

        {pubkey && isSupported && viewMode === 'thread' && (
          <ConversationThreadView
            conversation={selectedConversation}
            draftRecipientPubkeys={draftRecipientPubkeys}
            onOpenCompose={handleOpenCompose}
            onSent={() => {
              if (draftRecipientPubkeys.length > 0) {
                setSelectedConversationId(toConversationId(draftRecipientPubkeys))
                setDraftRecipientPubkeys([])
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
  draftRecipientPubkeys,
  unreadMessageCount,
  hasUnreadMessages,
  onBack,
  onCompose,
  onMarkAllAsRead
}: {
  viewMode: TMessagesViewMode
  conversation: TMessageConversation | null
  draftRecipientPubkeys: string[]
  unreadMessageCount: number
  hasUnreadMessages: boolean
  onBack: () => void
  onCompose: () => void
  onMarkAllAsRead: () => void
}) {
  const { t } = useTranslation()

  if (viewMode === 'thread') {
    const zapTargetPubkey = conversation?.isGroup
      ? null
      : conversation?.primaryPubkey ?? draftRecipientPubkeys[0]

    return (
      <div className="flex items-center h-full pl-1 pr-2 gap-2">
        <Button variant="ghost" size="titlebar-icon" onClick={onBack} aria-label={t('Back')}>
          <ArrowLeft />
        </Button>
        <ConversationAvatar
          conversation={conversation}
          draftRecipientPubkeys={draftRecipientPubkeys}
          size="small"
        />
        <div className="min-w-0 flex-1">
          {conversation || draftRecipientPubkeys.length > 0 ? (
            <ConversationTitle
              conversation={conversation}
              draftRecipientPubkeys={draftRecipientPubkeys}
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
        {zapTargetPubkey && <DirectMessageZapActions pubkey={zapTargetPubkey} />}
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
        <MessageCircle strokeWidth={1.3} />
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
  accountPubkey,
  query,
  onQueryChange,
  profiles,
  isFetching,
  selectedRecipientPubkeys,
  matchingConversation,
  onToggleProfile,
  onRemoveRecipient,
  onStartConversation
}: {
  accountPubkey: string
  query: string
  onQueryChange: (value: string) => void
  profiles: TProfile[]
  isFetching: boolean
  selectedRecipientPubkeys: string[]
  matchingConversation: TMessageConversation | null
  onToggleProfile: (profile: TProfile) => void
  onRemoveRecipient: (recipientPubkey: string) => void
  onStartConversation: () => void
}) {
  const { t } = useTranslation()
  const hasQuery = !!query.trim()
  const selectedCount = selectedRecipientPubkeys.length
  const isGroupSelection = selectedCount > 1
  const actionLabel =
    selectedCount === 0
      ? t('Start chat', { defaultValue: 'Start chat' })
      : matchingConversation
        ? isGroupSelection
          ? t('Open Group', { defaultValue: 'Open Group' })
          : t('Open Chat', { defaultValue: 'Open Chat' })
        : isGroupSelection
          ? t('Start Group', { defaultValue: 'Start Group' })
          : t('Start Chat', { defaultValue: 'Start Chat' })
  const helperText =
    selectedCount === 0
      ? t('Search for one or more people, then start your chat when you are ready.', {
          defaultValue: 'Search for one or more people, then start your chat when you are ready.'
        })
      : matchingConversation
        ? isGroupSelection
          ? t('This participant group already has a conversation.', {
              defaultValue: 'This participant group already has a conversation.'
            })
          : t('You already have a conversation with this person.', {
              defaultValue: 'You already have a conversation with this person.'
            })
        : isGroupSelection
          ? t('Start a new group chat with the selected people.', {
              defaultValue: 'Start a new group chat with the selected people.'
            })
          : t('Start a direct chat with the selected person.', {
              defaultValue: 'Start a direct chat with the selected person.'
            })
  const visibleProfiles = profiles.filter((profile) => profile.pubkey !== accountPubkey)

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('Search people by name, nip05, or npub')}
      />

      <div className="rounded-xl border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {selectedCount > 0
                ? t('{{count}} selected', {
                    defaultValue: '{{count}} selected',
                    count: selectedCount
                  })
                : t('No one selected yet', { defaultValue: 'No one selected yet' })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={selectedCount === 0}
            onClick={onStartConversation}
          >
            {actionLabel}
          </Button>
        </div>

        {selectedCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedRecipientPubkeys.map((recipientPubkey) => (
              <SelectedRecipientChip
                key={recipientPubkey}
                recipientPubkey={recipientPubkey}
                onRemove={() => onRemoveRecipient(recipientPubkey)}
              />
            ))}
          </div>
        )}
      </div>

      {!hasQuery ? (
        <div className="rounded-xl border px-4 py-10 text-center">
          <div className="text-base font-semibold">
            {t('Pick people for your next chat', {
              defaultValue: 'Pick people for your next chat'
            })}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Search multiple names if you want to start a group.', {
              defaultValue: 'Search multiple names if you want to start a group.'
            })}
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
          ) : visibleProfiles.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t('No users found')}
            </div>
          ) : (
            visibleProfiles.map((profile) => {
              const isSelected = selectedRecipientPubkeys.includes(profile.pubkey)

              return (
                <button
                key={profile.pubkey}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40',
                  isSelected && 'bg-primary/5'
                )}
                onClick={() => onToggleProfile(profile)}
              >
                <SimpleUserAvatar userId={profile.pubkey} size="small" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{profile.username}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {profile.nip05 || profile.npub}
                  </div>
                </div>
                <div
                  className={cn(
                    'inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-medium transition-colors',
                    isSelected
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {isSelected ? (
                    <>
                      <Check className="mr-1 size-3.5" />
                      {t('Added', { defaultValue: 'Added' })}
                    </>
                  ) : (
                    t('Add', { defaultValue: 'Add' })
                  )}
                </div>
              </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function SelectedRecipientChip({
  recipientPubkey,
  onRemove
}: {
  recipientPubkey: string
  onRemove: () => void
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1.5">
      <SimpleUserAvatar userId={recipientPubkey} size="xSmall" />
      <ParticipantDisplayName pubkey={recipientPubkey} className="max-w-[10rem] truncate text-xs font-medium" />
      <button
        type="button"
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={onRemove}
        aria-label="Remove recipient"
        title="Remove recipient"
      >
        <X className="size-3" />
      </button>
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
        className="-mx-4 sticky bottom-0 border-t bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
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

function ConversationAvatar({
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

function ConversationTitle({
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

function ParticipantDisplayName({
  pubkey,
  className
}: {
  pubkey: string
  className?: string
}) {
  const { profile } = useFetchProfile(pubkey)

  return <span className={className}>{profile?.username || formatUserId(pubkey)}</span>
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
  isYou
}: {
  participantPubkey: string
  isYou: boolean
}) {
  const { t } = useTranslation()
  const { profile } = useFetchProfile(participantPubkey)
  const secondaryText = profile?.nip05 || profile?.npub || formatUserId(participantPubkey)

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-3">
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
    </div>
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
  const { pubkey } = useNostr()
  const showSender = !!conversation?.isGroup && !message.isOutgoing
  const reactionSummaries = useMemo(
    () => summarizeMessageReactions(reactions, pubkey),
    [pubkey, reactions]
  )
  const renderableEvent = useMemo(() => toRenderableConversationEvent(message), [message])

  return (
    <div
      className={cn(
        'group flex items-end gap-2',
        message.isOutgoing ? 'justify-end' : 'justify-start'
      )}
    >
      {!message.isOutgoing && (
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
          <Content
            event={renderableEvent}
            className="text-sm whitespace-pre-wrap break-words"
            mustLoadMedia
          />
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
                  'inline-flex min-h-7 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs shadow-sm',
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
      {message.isOutgoing && (
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
    'mt-2 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition',
    'opacity-80 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
    isSending && 'opacity-100 text-foreground'
  )

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
          {isSending ? <Loader className="size-4 animate-spin" /> : <MessageCirclePlus className="size-4" />}
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
          {isSending ? <Loader className="size-4 animate-spin" /> : <MessageCirclePlus className="size-4" />}
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
  const [attachments, setAttachments] = useState<TComposerAttachment[]>([])
  const [uploadProgresses, setUploadProgresses] = useState<TUploadProgressItem[]>([])

  const handleUploadStart = (file: File, cancel: () => void) => {
    setUploadProgresses((current) => [...current, { file, progress: 0, cancel }])
  }

  const handleUploadProgress = (file: File, progress: number) => {
    setUploadProgresses((current) =>
      current.map((item) => (item.file === file ? { ...item, progress } : item))
    )
  }

  const handleUploadEnd = (file: File) => {
    setUploadProgresses((current) => current.filter((item) => item.file !== file))
  }

  const handleUploadSuccess = ({ url }: { url: string; tags: string[][] }) => {
    setAttachments((current) => {
      if (current.some((attachment) => attachment.url === url)) {
        return current
      }

      return [...current, { url, imetaTag: mediaUpload.getImetaTagByUrl(url) }]
    })
  }

  const handleRemoveAttachment = (url: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.url !== url))
  }

  const handleSend = async () => {
    const trimmedContent = content.trim()
    const attachmentUrls = attachments.map((attachment) => attachment.url)
    const messageContent = attachmentUrls.length
      ? [trimmedContent, ...attachmentUrls].filter(Boolean).join('\n')
      : trimmedContent
    const additionalTags = attachments
      .map((attachment) => attachment.imetaTag)
      .filter((tag): tag is string[] => !!tag)

    if ((!messageContent && attachments.length === 0) || isSending || uploadProgresses.length > 0) {
      return
    }

    setIsSending(true)

    try {
      await sendMessage(recipientPubkeys, messageContent, { replyToId, subject, additionalTags })
      setContent('')
      setAttachments([])
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
      {(attachments.length > 0 || uploadProgresses.length > 0) && (
        <div className="space-y-2">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.url}
                  className="relative rounded-xl border bg-background px-2 py-2"
                >
                  <button
                    type="button"
                    className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
                    aria-label={t('Remove attachment')}
                    title={t('Remove attachment')}
                    onClick={() => handleRemoveAttachment(attachment.url)}
                  >
                    <X className="size-4" />
                  </button>
                  <Content
                    content={attachment.url}
                    className="max-w-[220px] pr-6 text-sm"
                    mustLoadMedia
                    compactMedia
                  />
                </div>
              ))}
            </div>
          )}

          {uploadProgresses.length > 0 &&
            uploadProgresses.map(({ file, progress, cancel }, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <Loader className="size-4 animate-spin text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{file.name || t('Uploading...')}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                  onClick={cancel}
                  aria-label={t('Cancel upload')}
                  title={t('Cancel upload')}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
        </div>
      )}

      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        className="min-h-[88px] max-h-[200px] resize-y"
      />
      <div className="flex items-center justify-between gap-3">
        <Uploader
          accept="image/*,video/*,audio/*"
          className={isSending ? 'pointer-events-none opacity-60' : undefined}
          onUploadSuccess={handleUploadSuccess}
          onUploadStart={handleUploadStart}
          onUploadEnd={handleUploadEnd}
          onProgress={handleUploadProgress}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={t('Attach media')}
            title={t('Attach media')}
            disabled={isSending}
          >
            <Paperclip className="size-4" />
          </Button>
        </Uploader>
        <Button
          onClick={handleSend}
          disabled={
            isSending ||
            uploadProgresses.length > 0 ||
            (!content.trim() && attachments.length === 0)
          }
        >
          <SendHorizontal />
          {isSending ? t('Sending...') : submitLabel}
        </Button>
      </div>
    </div>
  )
}

function DirectMessageZapActions({ pubkey }: { pubkey: string }) {
  const { paymentsEnabled } = usePaymentsEnabled()
  const { chargeZapEnabled, quickZap, isWalletConnected } = useZap()

  if (!paymentsEnabled) {
    return null
  }

  const showChargeZap = isWalletConnected && chargeZapEnabled && quickZap

  return (
    <div className="flex items-center gap-1 shrink-0">
      {showChargeZap && <DirectMessageChargeZapButton pubkey={pubkey} />}
      <DirectMessageZapButton pubkey={pubkey} />
    </div>
  )
}

function DirectMessageZapButton({ pubkey: recipientPubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { checkLogin, pubkey } = useNostr()
  const { defaultZapSats, defaultZapComment, quickZap, zapSound, isWalletConnected } = useZap()
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [openZapDialog, setOpenZapDialog] = useState(false)
  const [isPendingQuickZap, setIsPendingQuickZap] = useState(false)
  const [disable, setDisable] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    setDisable(true)

    void client.fetchProfile(recipientPubkey).then((profile) => {
      if (!isMounted || !profile) return
      if (pubkey === profile.pubkey) return
      const lightningAddress = getLightningAddressFromProfile(profile)
      if (lightningAddress) {
        setDisable(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [pubkey, recipientPubkey])

  const handleZap = async () => {
    try {
      if (!pubkey) {
        throw new Error('You need to be logged in to zap')
      }
      if (isPendingQuickZap) return

      playZapSound(zapSound, isWalletConnected)

      setIsPendingQuickZap(true)
      await lightning.zap(pubkey, recipientPubkey, defaultZapSats, defaultZapComment)
    } catch (error) {
      toast.error(`${t('Zap failed')}: ${(error as Error).message}`)
    } finally {
      setIsPendingQuickZap(false)
    }
  }

  const handleClickStart = (event: MouseEvent | TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable) return

    isLongPressRef.current = false

    if ('touches' in event) {
      const touch = event.touches[0]
      setTouchStart({ x: touch.clientX, y: touch.clientY })
    }

    if (quickZap) {
      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true
        checkLogin(() => {
          setOpenZapDialog(true)
        })
      }, 500)
    }
  }

  const handleClickEnd = (event: MouseEvent | TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    if (disable) return

    if ('touches' in event) {
      setTouchStart(null)
      if (!touchStart) return
      const touch = event.changedTouches[0]
      const diffX = Math.abs(touch.clientX - touchStart.x)
      const diffY = Math.abs(touch.clientY - touchStart.y)
      if (diffX > 10 || diffY > 10) return
    }

    if (!quickZap) {
      checkLogin(() => {
        setOpenZapDialog(true)
      })
    } else if (!isLongPressRef.current) {
      checkLogin(() => handleZap())
    }

    isLongPressRef.current = false
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          disable
            ? 'cursor-not-allowed text-muted-foreground/40'
            : 'text-muted-foreground hover:text-primary',
          isPendingQuickZap && 'text-primary'
        )}
        title={t('Zap')}
        aria-label={t('Zap')}
        aria-busy={isPendingQuickZap}
        disabled={disable || isPendingQuickZap}
        onMouseDown={handleClickStart}
        onMouseUp={handleClickEnd}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleClickStart}
        onTouchEnd={handleClickEnd}
      >
        <Zap className={cn(isPendingQuickZap && 'fill-primary animate-pulse')} />
      </button>
      <ZapDialog open={openZapDialog} setOpen={setOpenZapDialog} pubkey={recipientPubkey} />
    </>
  )
}

function DirectMessageChargeZapButton({ pubkey: recipientPubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { checkLogin, pubkey } = useNostr()
  const { chargeZapLimit, zapSound, isWalletConnected } = useZap()
  const [isCharging, setIsCharging] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(0)
  const [zapping, setZapping] = useState(false)
  const [disable, setDisable] = useState(true)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const chargeStartTimeRef = useRef<number>(0)
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isTouchDeviceRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    setDisable(true)

    void client.fetchProfile(recipientPubkey).then((profile) => {
      if (!isMounted || !profile) return
      if (pubkey === profile.pubkey) return
      const lightningAddress = getLightningAddressFromProfile(profile)
      if (lightningAddress) {
        setDisable(false)
      }
    })

    return () => {
      isMounted = false
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
      }
    }
  }, [pubkey, recipientPubkey])

  const startCharging = () => {
    setIsCharging(true)
    setChargeAmount(0)
    chargeStartTimeRef.current = Date.now()

    chargeIntervalRef.current = setInterval(() => {
      const duration = Date.now() - chargeStartTimeRef.current
      const amount = calculateChargeZapAmount(duration, chargeZapLimit)
      setChargeAmount(amount)

      if (amount >= chargeZapLimit && chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
      }
    }, 50)
  }

  const stopCharging = async () => {
    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current)
      chargeIntervalRef.current = null
    }

    const finalAmount = chargeAmount
    setIsCharging(false)
    setChargeAmount(0)

    if (finalAmount === 0 || !buttonRef.current) {
      return
    }

    fireChargeZapConfetti(buttonRef.current, finalAmount, chargeZapLimit)

    try {
      if (!pubkey) {
        throw new Error('You need to be logged in to zap')
      }

      playZapSound(zapSound, isWalletConnected)

      setZapping(true)
      const zapResult = await lightning.zap(pubkey, recipientPubkey, finalAmount, '')

      if (!zapResult) {
        return
      }

      toast.success(t('Zap sent successfully', { defaultValue: 'Zap sent successfully' }))
    } catch (error) {
      toast.error(`${t('Zap failed')}: ${(error as Error).message}`)
    } finally {
      setZapping(false)
    }
  }

  const handleMouseDown = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping) return

    isTouchDeviceRef.current = false
    checkLogin(() => startCharging())
  }

  const handleMouseUp = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping || isTouchDeviceRef.current) return

    void stopCharging()
  }

  const handleMouseLeave = () => {
    if (isCharging && !isTouchDeviceRef.current) {
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
        chargeIntervalRef.current = null
      }
      setIsCharging(false)
      setChargeAmount(0)
    }
  }

  const handleTouchStart = (event: TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping) return

    isTouchDeviceRef.current = true
    const touch = event.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })

    checkLogin(() => startCharging())
  }

  const handleTouchEnd = (event: TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping || !touchStart) return

    const touch = event.changedTouches[0]
    const diffX = Math.abs(touch.clientX - touchStart.x)
    const diffY = Math.abs(touch.clientY - touchStart.y)
    setTouchStart(null)

    if (diffX > 10 || diffY > 10) {
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
        chargeIntervalRef.current = null
      }
      setIsCharging(false)
      setChargeAmount(0)
      return
    }

    void stopCharging()
  }

  return (
    <div className="relative shrink-0">
      {isCharging && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-yellow-400 px-2 py-1 text-xs font-bold text-black whitespace-nowrap z-10 animate-pulse">
          {chargeAmount} {t('Sats')}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          disable
            ? 'cursor-not-allowed text-muted-foreground/40'
            : 'text-muted-foreground hover:text-yellow-400',
          (isCharging || zapping) && 'text-yellow-400'
        )}
        title={t('Charge Zap')}
        aria-label={t('Charge Zap')}
        disabled={disable || zapping}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {zapping ? (
          <Loader className="animate-spin" />
        ) : (
          <PlugZap className={cn(isCharging && 'fill-yellow-400')} />
        )}
      </button>
    </div>
  )
}
