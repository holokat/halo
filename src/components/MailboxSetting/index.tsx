import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { normalizeUrl } from '@/lib/url'
import { useNostr } from '@/providers/NostrProvider'
import { TMailboxRelay } from '@/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import NewMailboxRelayInput from './NewMailboxRelayInput'
import RelayCountWarning from './RelayCountWarning'
import FollowsRelayRecommendations from './FollowsRelayRecommendations'
import InboxRelayRecommendations from './InboxRelayRecommendations'
import { createInboxRelayListDraftEvent, createRelayListDraftEvent } from '@/lib/draft-event'
import { Plus, Trash2 } from 'lucide-react'
import RelayIcon from '../RelayIcon'
import RelayTutorialDialog from '../RelayTutorialDialog'
import RelayHealthBadge from '../RelayHealthBadge'

const MAX_INBOX_RELAYS = 3

export type TMailboxSettingSaveState = {
  save: () => void
  canSave: boolean
  isSaving: boolean
}

export default function MailboxSetting({
  onSaveStateChange
}: {
  onSaveStateChange?: (state: TMailboxSettingSaveState) => void
}) {
  const { t } = useTranslation()
  const { pubkey, relayList, inboxRelayUrls, publish, updateInboxRelayEvent, updateRelayListEvent } =
    useNostr()
  const [relays, setRelays] = useState<TMailboxRelay[]>([])
  const [inboxRelays, setInboxRelays] = useState<string[]>([])
  const [hasRelayChange, setHasRelayChange] = useState(false)
  const [hasInboxRelayChange, setHasInboxRelayChange] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'read' | 'write'>('read')

  useEffect(() => {
    if (!relayList) return

    setRelays(relayList.originalRelays)
    setHasRelayChange(false)
  }, [relayList])

  useEffect(() => {
    setInboxRelays(inboxRelayUrls)
    setHasInboxRelayChange(false)
  }, [inboxRelayUrls])

  const readRelays = useMemo(
    () => relays.filter((relay) => relay.scope !== 'write'),
    [relays]
  )
  const publishRelays = useMemo(
    () => relays.filter((relay) => relay.scope !== 'read'),
    [relays]
  )

  const hasChange = hasRelayChange || hasInboxRelayChange

  const markRelayDirty = () => {
    setHasRelayChange(true)
  }

  const markInboxRelayDirty = () => {
    setHasInboxRelayChange(true)
  }

  const changeRelayScope = (url: string, scope: TMailboxRelay['scope']) => {
    setRelays((prev) => prev.map((relay) => (relay.url === url ? { ...relay, scope } : relay)))
    markRelayDirty()
  }

  const addRelayToScope = (url: string, scope: 'read' | 'write') => {
    if (url === '') return null

    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) {
      return t('Invalid relay URL')
    }

    const existingRelay = relays.find((relay) => relay.url === normalizedUrl)
    if (!existingRelay) {
      setRelays([...relays, { url: normalizedUrl, scope }])
      markRelayDirty()
      return null
    }

    const alreadyIncluded =
      (scope === 'read' && existingRelay.scope !== 'write') ||
      (scope === 'write' && existingRelay.scope !== 'read')

    if (alreadyIncluded) {
      return t('Relay already exists')
    }

    changeRelayScope(normalizedUrl, 'both')
    return null
  }

  const removeRelayFromScope = (url: string, scope: 'read' | 'write') => {
    setRelays((prev) =>
      prev.flatMap((relay) => {
        if (relay.url !== url) return [relay]

        if (scope === 'read') {
          if (relay.scope === 'read') return []
          if (relay.scope === 'both') return [{ ...relay, scope: 'write' }]
        }

        if (scope === 'write') {
          if (relay.scope === 'write') return []
          if (relay.scope === 'both') return [{ ...relay, scope: 'read' }]
        }

        return [relay]
      })
    )
    markRelayDirty()
  }

  const addInboxRelay = (url: string) => {
    if (url === '') return null

    if (inboxRelays.length >= MAX_INBOX_RELAYS) {
      return t('You can publish up to 3 inbox relays.')
    }

    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) {
      return t('Invalid relay URL')
    }

    if (inboxRelays.includes(normalizedUrl)) {
      return t('Relay already exists')
    }

    setInboxRelays((prev) => [...prev, normalizedUrl])
    markInboxRelayDirty()
    return null
  }

  const removeInboxRelay = (url: string) => {
    setInboxRelays((prev) => prev.filter((relayUrl) => relayUrl !== url))
    markInboxRelayDirty()
  }

  const replaceInboxRelays = (urls: string[]) => {
    const nextInboxRelays = Array.from(
      new Set(
        urls
          .map((url) => normalizeUrl(url))
          .filter(Boolean)
      )
    ).slice(0, MAX_INBOX_RELAYS)

    setInboxRelays(nextInboxRelays)
    markInboxRelayDirty()
  }

  const saveRelays = useCallback(async () => {
    if (!pubkey || !relayList || isSaving || !hasChange) return
    if (readRelays.length === 0) {
      toast.error(t('Add at least one read relay to load your feed.'))
      return
    }
    if (inboxRelays.length === 0) {
      toast.error(t('Add at least one inbox relay so other clients know where to deliver your messages.'))
      return
    }

    try {
      setIsSaving(true)

      if (hasRelayChange) {
        const relayListEvent = await publish(createRelayListDraftEvent(relays))
        await updateRelayListEvent(relayListEvent)
      }

      if (hasInboxRelayChange) {
        const inboxRelayEvent = await publish(createInboxRelayListDraftEvent(inboxRelays))
        await updateInboxRelayEvent(inboxRelayEvent)
      }

      setHasRelayChange(false)
      setHasInboxRelayChange(false)
      toast.success(t('Relay settings saved'))
    } catch (error) {
      console.error('Failed to save relay settings:', error)
      toast.error(t('Failed to save relay settings'))
    } finally {
      setIsSaving(false)
    }
  }, [
    pubkey,
    relayList,
    isSaving,
    hasChange,
    relays,
    publish,
    readRelays,
    inboxRelays,
    hasRelayChange,
    hasInboxRelayChange,
    updateInboxRelayEvent,
    updateRelayListEvent,
    t
  ])

  useEffect(() => {
    onSaveStateChange?.({
      save: saveRelays,
      canSave:
        !!pubkey &&
        !!relayList &&
        hasChange &&
        !isSaving &&
        readRelays.length > 0 &&
        inboxRelays.length > 0,
      isSaving
    })
  }, [onSaveStateChange, saveRelays, pubkey, relayList, hasChange, isSaving, readRelays.length, inboxRelays.length])

  if (!relayList) {
    return null
  }

  return (
    <div className="space-y-4">
      <RelayCountWarning relays={relays} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">{t('My Relays')}</CardTitle>
            <RelayTutorialDialog>
              <button
                type="button"
                className="text-sm font-medium text-primary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {t("What's a relay?")}
              </button>
            </RelayTutorialDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'read' | 'write')}>
            <TabsList className="grid w-full grid-cols-2 rounded-full p-1">
              <TabsTrigger value="read" className="rounded-full">
                <span className="mr-2">{t('Read Relays')}</span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium">
                  {readRelays.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="write" className="rounded-full">
                <span className="mr-2">{t('Publish Relays')}</span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium">
                  {publishRelays.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="read" className="space-y-3 pt-4">
              <RelayList
                relays={readRelays}
                role="read"
                onAddOtherScope={(url) => changeRelayScope(url, 'both')}
                onRemove={(url) => removeRelayFromScope(url, 'read')}
              />
              <NewMailboxRelayInput
                saveNewMailboxRelay={(url) => addRelayToScope(url, 'read')}
                placeholder={t('Add read relay (wss://...)')}
                addLabel={t('Add')}
              />
            </TabsContent>

            <TabsContent value="write" className="space-y-3 pt-4">
              <RelayList
                relays={publishRelays}
                role="write"
                onAddOtherScope={(url) => changeRelayScope(url, 'both')}
                onRemove={(url) => removeRelayFromScope(url, 'write')}
              />
              <NewMailboxRelayInput
                saveNewMailboxRelay={(url) => addRelayToScope(url, 'write')}
                placeholder={t('Add publish relay (wss://...)')}
                addLabel={t('Add')}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('Recommended from follows')}</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowsRelayRecommendations
            existingRelayUrls={readRelays.map((relay) => relay.url)}
            onAddRelay={(url) => {
              addRelayToScope(url, 'read')
            }}
            hideHeader
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="space-y-1">
            <CardTitle className="text-sm">{t('Direct Message Inbox')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                'These relays are published in your kind 10050 inbox list so other apps know where to deliver your NIP-17 direct messages.'
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <InboxRelayList relays={inboxRelays} onRemove={removeInboxRelay} />
          <NewMailboxRelayInput
            saveNewMailboxRelay={addInboxRelay}
            placeholder={t('Add inbox relay (wss://...)')}
            addLabel={t('Add')}
          />
          <div className="text-xs text-muted-foreground">
            {t('We recommend keeping 2-3 inbox relays so your DMs stay reliable without a lot of maintenance.')}
          </div>
          <InboxRelayRecommendations
            existingRelayUrls={inboxRelays}
            onAddRelay={(url) => {
              const error = addInboxRelay(url)
              if (error) {
                toast.error(error)
              }
            }}
            onAutoPickRelayUrls={replaceInboxRelays}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function RelayList({
  relays,
  role,
  onAddOtherScope,
  onRemove
}: {
  relays: TMailboxRelay[]
  role: 'read' | 'write'
  onAddOtherScope: (url: string) => void
  onRemove: (url: string) => void
}) {
  const { t } = useTranslation()

  if (relays.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
        {role === 'read' ? t('No read relays added yet') : t('No publish relays added yet')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {relays.map((relay) => (
        <div
          key={`${role}-${relay.url}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <RelayIcon url={relay.url} />
            <div className="truncate text-sm font-medium">{relay.url}</div>
          </div>
          <div className="flex items-center gap-2">
            {relay.scope !== 'both' && (
              <Button size="sm" variant="outline" onClick={() => onAddOtherScope(relay.url)}>
                <Plus className="size-4" />
                {role === 'read' ? t('Also publish') : t('Also read')}
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onRemove(relay.url)} aria-label={t('Remove relay')}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function InboxRelayList({
  relays,
  onRemove
}: {
  relays: string[]
  onRemove: (url: string) => void
}) {
  const { t } = useTranslation()

  if (relays.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
        {t('No inbox relays added yet')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {relays.map((relayUrl) => (
        <div
          key={relayUrl}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <RelayIcon url={relayUrl} />
            <div className="truncate text-sm font-medium">{relayUrl}</div>
          </div>
          <div className="flex items-center gap-2">
            <RelayHealthBadge url={relayUrl} />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemove(relayUrl)}
              aria-label={t('Remove relay')}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
