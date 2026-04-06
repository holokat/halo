import AlertCard from '@/components/AlertCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MessageCircle } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { useSearchProfiles } from '@/hooks/useSearchProfiles'
import { useNostr } from '@/providers/NostrProvider'
import { useMessages, TMessageConversation } from '@/providers/MessagesProvider'
import { TPageRef, TProfile } from '@/types'
import {
  TMessagesViewMode,
  TOverviewTab,
  findConversationByParticipants,
  findDirectConversationByPubkey,
  normalizeRecipientPubkeys,
  toConversationId
} from './messages-page.utils'
import { MessagesPageTitlebar } from './messages-page-titlebar'
import { MessagesOverview, ComposeMessageView } from './messages-page-overview'
import { ConversationThreadView } from './messages-page-thread'

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
    error,
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

  const selectedConversation = useMemo(
    () =>
      selectedConversationId
        ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : null,
    [conversations, selectedConversationId]
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
    () => findConversationByParticipants(conversations, normalizedComposeRecipientPubkeys),
    [conversations, normalizedComposeRecipientPubkeys]
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

    const matchingConversation = findDirectConversationByPubkey(conversations, composeTo)

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
  }, [conversations, composeTo])

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
          <>
            {error && (
              <AlertCard
                title={t('Messages sync issue')}
                content={error}
              />
            )}
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
          </>
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
