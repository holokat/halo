import SearchInput from '@/components/SearchInput'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TMessageConversation } from '@/providers/MessagesProvider'
import { TProfile } from '@/types'
import {
  Check,
  EyeOff,
  Inbox,
  MoreHorizontal
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TOverviewTab } from './messages-page.utils'
import { ConversationAvatar, ConversationTitle, ParticipantDisplayName } from './messages-page-thread'

export function MessagesOverview({
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
              <Check />
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
    <Card className="rounded-xl border px-4 py-4">
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
    </Card>
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

export function ComposeMessageView({
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
        <span className="text-sm leading-none">×</span>
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
