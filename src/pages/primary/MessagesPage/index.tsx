import AlertCard from '@/components/AlertCard'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { cn } from '@/lib/utils'
import { useMessages, TMessageConversation } from '@/providers/MessagesProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TPageRef } from '@/types'
import {
  ChevronDown,
  ChevronUp,
  Inbox,
  MessageCircle,
  MessagesSquare,
  SendHorizontal,
  Users,
  X
} from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const MAX_VISIBLE_MESSAGES = 25

function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

const MessagesPage = forwardRef(({ composeTo }: { composeTo?: string | null }, ref) => {
  const { t } = useTranslation()
  const layoutRef = useRef<TPageRef>(null)
  const { pubkey, startLogin } = useNostr()
  const {
    activeConversations,
    requests,
    isLoading,
    error,
    isSupported,
    unreadMessageCount,
    unreadConversationCount,
    sendMessage
  } = useMessages()
  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(null)
  const [pendingComposeTo, setPendingComposeTo] = useState<string | null>(composeTo ?? null)

  useImperativeHandle(ref, () => layoutRef.current as TPageRef)

  useEffect(() => {
    if (expandedConversationId) {
      const stillExists = activeConversations.concat(requests).some(
        (conversation) => conversation.id === expandedConversationId
      )
      if (!stillExists) {
        setExpandedConversationId(null)
      }
      return
    }

    const firstUnreadConversation = activeConversations
      .concat(requests)
      .find((conversation) => conversation.unreadCount > 0)

    if (firstUnreadConversation) {
      setExpandedConversationId(firstUnreadConversation.id)
    }
  }, [activeConversations, expandedConversationId, requests])

  useEffect(() => {
    if (!composeTo) {
      setPendingComposeTo(null)
      return
    }

    const matchingConversation = activeConversations
      .concat(requests)
      .find(
        (conversation) =>
          conversation.participantPubkeys.length === 1 && conversation.primaryPubkey === composeTo
      )

    if (matchingConversation) {
      setExpandedConversationId(matchingConversation.id)
      setPendingComposeTo(null)
      return
    }

    setPendingComposeTo(composeTo)
    setExpandedConversationId(null)
  }, [activeConversations, composeTo, requests])

  const hasAnyMessages = activeConversations.length > 0 || requests.length > 0

  return (
    <PrimaryPageLayout
      ref={layoutRef}
      pageName="messages"
      titlebar={<MessagesPageTitlebar />}
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

        {pubkey && unreadMessageCount > 0 && (
          <AlertCard
            title={t('New messages')}
            content={t('{{count}} unread messages across {{conversationCount}} conversations.', {
              count: unreadMessageCount,
              conversationCount: unreadConversationCount
            })}
          />
        )}

        {error && <AlertCard title={t('Message sync issue')} content={error} />}

        {pubkey && isSupported && pendingComposeTo && (
          <DirectMessageComposerCard
            pubkey={pendingComposeTo}
            onCancel={() => setPendingComposeTo(null)}
            onSend={async (content) => {
              await sendMessage([pendingComposeTo], content)
              setExpandedConversationId(toConversationId([pendingComposeTo]))
              setPendingComposeTo(null)
            }}
          />
        )}

        {pubkey && isSupported && !hasAnyMessages && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Inbox className="text-muted-foreground" />
              <div className="space-y-1">
                <div className="text-lg font-semibold">{t('No messages yet')}</div>
                <p className="text-sm text-muted-foreground">
                  {t('When someone sends you a NIP-17 direct message, it will show up here.')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {(isLoading || activeConversations.length > 0 || hasAnyMessages) && (
          <ConversationSection
            title={t('Conversations')}
            description={t('People you already talk to or have replied to.')}
            conversations={activeConversations}
            expandedConversationId={expandedConversationId}
            onToggleConversation={setExpandedConversationId}
            isLoading={isLoading && activeConversations.length === 0}
            emptyState={t('No active conversations yet.')}
          />
        )}

        {(isLoading || requests.length > 0 || hasAnyMessages) && (
          <ConversationSection
            title={t('Requests')}
            description={t('People who messaged you but are not in your main DM list yet.')}
            conversations={requests}
            expandedConversationId={expandedConversationId}
            onToggleConversation={setExpandedConversationId}
            isLoading={isLoading && requests.length === 0}
            emptyState={t('No incoming requests right now.')}
            tone="muted"
          />
        )}
      </div>
    </PrimaryPageLayout>
  )
})

MessagesPage.displayName = 'MessagesPage'

export default MessagesPage

function MessagesPageTitlebar() {
  const { t } = useTranslation()
  const { hasUnreadMessages, unreadMessageCount, markAllAsRead } = useMessages()

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
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={markAllAsRead}
        disabled={!hasUnreadMessages}
      >
        {t('Mark all as read')}
      </Button>
    </div>
  )
}

function ConversationSection({
  title,
  description,
  conversations,
  expandedConversationId,
  onToggleConversation,
  isLoading,
  emptyState,
  tone = 'default'
}: {
  title: string
  description: string
  conversations: TMessageConversation[]
  expandedConversationId: string | null
  onToggleConversation: (conversationId: string | null) => void
  isLoading?: boolean
  emptyState: string
  tone?: 'default' | 'muted'
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {conversations.length > 0 && <Badge variant="secondary">{conversations.length}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <ConversationSkeleton />
          <ConversationSkeleton />
        </div>
      ) : conversations.length === 0 ? (
        <Card className={cn(tone === 'muted' && 'border-dashed')}>
          <CardContent className="p-4 text-sm text-muted-foreground">{emptyState}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              expanded={expandedConversationId === conversation.id}
              onToggle={() =>
                onToggleConversation(
                  expandedConversationId === conversation.id ? null : conversation.id
                )
              }
              tone={tone}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ConversationCard({
  conversation,
  expanded,
  onToggle,
  tone = 'default'
}: {
  conversation: TMessageConversation
  expanded: boolean
  onToggle: () => void
  tone?: 'default' | 'muted'
}) {
  const visibleMessages = useMemo(
    () => conversation.messages.slice(-MAX_VISIBLE_MESSAGES),
    [conversation.messages]
  )

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        expanded && 'border-primary',
        conversation.unreadCount > 0 && tone === 'default' && 'bg-primary/5',
        conversation.unreadCount > 0 && tone === 'muted' && 'bg-amber-500/5 border-amber-500/30'
      )}
    >
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ConversationAvatar conversation={conversation} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ConversationTitle conversation={conversation} />
                    {conversation.isRequest && (
                      <Badge variant="outline" className="shrink-0">
                        Request
                      </Badge>
                    )}
                  </div>
                  {conversation.subject && (
                    <div className="text-xs text-muted-foreground truncate">
                      {conversation.subject}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {conversation.unreadCount > 0 && (
                    <Badge variant="secondary">{conversation.unreadCount}</Badge>
                  )}
                  <FormattedTimestamp
                    timestamp={conversation.lastMessageAt}
                    short
                    className="text-xs text-muted-foreground"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground truncate">
                  {conversation.lastMessagePreview}
                </p>
                {expanded ? (
                  <ChevronUp className="text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="text-muted-foreground shrink-0" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </button>

      {expanded && (
        <>
          <Separator />
          <CardContent className="p-4 space-y-3">
            {conversation.messages.length > MAX_VISIBLE_MESSAGES && (
              <div className="text-xs text-muted-foreground">
                Showing the latest {MAX_VISIBLE_MESSAGES} messages in this conversation.
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
            <Separator />
            <ConversationComposer
              recipientPubkeys={conversation.participantPubkeys}
              subject={conversation.subject}
              replyToId={conversation.messages[conversation.messages.length - 1]?.id}
            />
          </CardContent>
        </>
      )}
    </Card>
  )
}

function ConversationAvatar({ conversation }: { conversation: TMessageConversation }) {
  if (conversation.isGroup || !conversation.primaryPubkey) {
    return (
      <div className="w-10 h-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <Users className="size-4" />
      </div>
    )
  }

  return <SimpleUserAvatar userId={conversation.primaryPubkey} size="medium" />
}

function ConversationTitle({ conversation }: { conversation: TMessageConversation }) {
  if (conversation.isGroup || !conversation.primaryPubkey) {
    return (
      <div className="font-semibold truncate">
        Group conversation
      </div>
    )
  }

  return (
    <SimpleUsername
      userId={conversation.primaryPubkey}
      className="font-semibold truncate"
    />
  )
}

function MessageBubble({
  conversation,
  message
}: {
  conversation: TMessageConversation
  message: TMessageConversation['messages'][number]
}) {
  const showSender = conversation.isGroup && !message.isOutgoing

  return (
    <div className={cn('flex', message.isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 space-y-1',
          message.isOutgoing
            ? 'bg-primary text-primary-foreground'
            : conversation.isRequest
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

function ConversationSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DirectMessageComposerCard({
  pubkey,
  onCancel,
  onSend
}: {
  pubkey: string
  onCancel: () => void
  onSend: (content: string) => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <Card className="border-primary/40">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SimpleUserAvatar userId={pubkey} size="medium" />
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{t('New message')}</div>
              <SimpleUsername userId={pubkey} className="font-semibold truncate" />
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label={t('Cancel')}>
            <X />
          </Button>
        </div>
        <ConversationComposer
          recipientPubkeys={[pubkey]}
          onSend={onSend}
          placeholder={t('Write your first message...')}
          submitLabel={t('Send message')}
        />
      </CardContent>
    </Card>
  )
}

function ConversationComposer({
  recipientPubkeys,
  subject,
  replyToId,
  placeholder,
  submitLabel = 'Send',
  onSend
}: {
  recipientPubkeys: string[]
  subject?: string
  replyToId?: string
  placeholder?: string
  submitLabel?: string
  onSend?: (content: string) => Promise<void>
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
      if (onSend) {
        await onSend(trimmedContent)
      } else {
        await sendMessage(recipientPubkeys, trimmedContent, {
          replyToId,
          subject
        })
      }

      setContent('')
      toast.success(t('Message sent'))
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
        placeholder={placeholder ?? t('Write a message...')}
        className="min-h-[96px]"
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
