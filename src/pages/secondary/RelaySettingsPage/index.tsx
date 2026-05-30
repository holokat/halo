import MailboxSetting, { TMailboxSettingSaveState } from '@/components/MailboxSetting'
import FavoriteRelaysSetting from '@/components/FavoriteRelaysSetting'
import InfoPopoverButton from '@/components/InfoPopoverButton'
import RelayIcon from '@/components/RelayIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DEFAULT_SAVE_STATE: TMailboxSettingSaveState = {
  save: () => undefined,
  canSave: false,
  isSaving: false
}

type TRelaySettingsTab = 'mailbox' | 'favorite-relays'

const RelaySettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { pubkey, relayList, inboxRelayUrls, checkLogin } = useNostr()
  const activeRelayUrls = useCurrentRelays().relayUrls
  const { favoriteRelays } = useFavoriteRelays()
  const [saveState, setSaveState] = useState<TMailboxSettingSaveState>(DEFAULT_SAVE_STATE)
  const [activeTab, setActiveTab] = useState<TRelaySettingsTab>('mailbox')
  const [showCustomize, setShowCustomize] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [trackedRelays, setTrackedRelays] = useState(() => client.getTrackedRelayStates())

  useEffect(() => {
    const sync = () => {
      setTrackedRelays(client.getTrackedRelayStates())
    }

    sync()
    const intervalId = window.setInterval(sync, 2000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const replaceHash = (hash?: 'mailbox' | 'favorite-relays' | 'advanced') => {
    const suffix = hash ? `#${hash}` : ''
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${suffix}`
    )
  }

  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === '#favorite-relays') {
        setActiveTab('favorite-relays')
        setShowCustomize(true)
        setShowDiagnostics(false)
        return
      }

      if (window.location.hash === '#mailbox') {
        setActiveTab('mailbox')
        setShowCustomize(true)
        setShowDiagnostics(false)
        return
      }

      if (window.location.hash === '#advanced') {
        setShowDiagnostics(true)
        setShowCustomize(false)
        return
      }

      setShowCustomize(false)
      setShowDiagnostics(false)
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => {
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [])

  const handleTabChange = (value: string) => {
    const nextTab = value === 'favorite-relays' ? 'favorite-relays' : 'mailbox'
    setActiveTab(nextTab)
    setShowCustomize(true)
    setShowDiagnostics(false)
    replaceHash(nextTab)
  }

  const toggleCustomize = () => {
    setShowCustomize((prev) => {
      const next = !prev
      if (next) {
        setShowDiagnostics(false)
        replaceHash(activeTab)
      } else {
        replaceHash()
      }
      return next
    })
  }

  const toggleDiagnostics = () => {
    setShowDiagnostics((prev) => {
      const next = !prev
      if (next) {
        setShowCustomize(false)
        replaceHash('advanced')
      } else {
        replaceHash()
      }
      return next
    })
  }

  const controls = pubkey && relayList && showCustomize && activeTab === 'mailbox'
    ? (
        <Button
          size="sm"
          className="rounded-full"
          disabled={!saveState.canSave}
          onClick={saveState.save}
        >
          {saveState.isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('Save')}
        </Button>
      )
    : undefined

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Network')} controls={controls}>
      <div className="space-y-4 px-4 py-3">
        {!pubkey ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="text-sm text-muted-foreground">{t('Sign in to manage your network settings')}</div>
            <Button size="lg" onClick={() => checkLogin()}>
              {t('Login')}
            </Button>
          </div>
        ) : !relayList ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('Loading network settings...')}
          </div>
        ) : (
          <>
            <NetworkOverviewCard
              inboxRelayCount={inboxRelayUrls.length}
              trackedRelays={trackedRelays}
              activeRelayUrls={activeRelayUrls}
              favoriteRelayCount={favoriteRelays.length}
              showCustomize={showCustomize}
              showDiagnostics={showDiagnostics}
              onToggleCustomize={toggleCustomize}
              onToggleDiagnostics={toggleDiagnostics}
            />

            {showCustomize && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm">{t('Customize')}</CardTitle>
                    <InfoPopoverButton label={t('Customize network')}>
                      {t(
                        'Only change this if you want to publish your preferences for other apps or choose your own relay sources. Halo can handle the rest automatically.'
                      )}
                    </InfoPopoverButton>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid w-full grid-cols-2 rounded-full p-1">
                      <TabsTrigger value="mailbox" className="rounded-full">
                        {t('Publishing')}
                      </TabsTrigger>
                      <TabsTrigger value="favorite-relays" className="rounded-full">
                        {t('Sources')}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="mailbox" className="mt-4">
                      <MailboxSetting onSaveStateChange={setSaveState} />
                    </TabsContent>

                    <TabsContent value="favorite-relays" className="mt-4">
                      <FavoriteRelaysSetting
                        compact
                        includeFollowsRecommendations
                        hideAutoSaveNotice
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {showDiagnostics && (
              <RelayDiagnosticsCard
                trackedRelays={trackedRelays}
                activeRelayUrls={activeRelayUrls}
              />
            )}
          </>
        )}
      </div>
    </SecondaryPageLayout>
  )
})
RelaySettingsPage.displayName = 'RelaySettingsPage'
export default RelaySettingsPage

function NetworkOverviewCard({
  inboxRelayCount,
  trackedRelays,
  activeRelayUrls,
  favoriteRelayCount,
  showCustomize,
  showDiagnostics,
  onToggleCustomize,
  onToggleDiagnostics
}: {
  inboxRelayCount: number
  trackedRelays: ReturnType<typeof client.getTrackedRelayStates>
  activeRelayUrls: string[]
  favoriteRelayCount: number
  showCustomize: boolean
  showDiagnostics: boolean
  onToggleCustomize: () => void
  onToggleDiagnostics: () => void
}) {
  const { t } = useTranslation()
  const connectedCount = trackedRelays.filter((relay) => relay.connected).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">{t('Managed automatically')}</CardTitle>
          <InfoPopoverButton label={t('How Halo manages this')}>
            {t(
              'Halo automatically picks relay connections for feeds, posting, and discovery while you use the app.'
            )}
          </InfoPopoverButton>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <NetworkStatusRow
            title={t('Feeds')}
            statusLabel={t('Working')}
            toneClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          />
          <NetworkStatusRow
            title={t('Posting')}
            statusLabel={t('Working')}
            toneClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          />
          <NetworkStatusRow
            title={t('Inbox relays')}
            statusLabel={inboxRelayCount > 0 ? t('Ready') : t('Optional setup')}
            toneClassName={
              inboxRelayCount > 0
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <SummaryBadge
            label={t('Connected')}
            value={connectedCount}
            toneClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          />
          <SummaryBadge
            label={t('In this view')}
            value={activeRelayUrls.length}
            toneClassName="bg-sky-500/10 text-sky-700 dark:text-sky-300"
          />
          <SummaryBadge
            label={t('Saved sources')}
            value={favoriteRelayCount}
            toneClassName="bg-violet-500/10 text-violet-700 dark:text-violet-300"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onToggleCustomize} className="rounded-full">
            {showCustomize ? <ChevronUp className="mr-2 size-4" /> : <ChevronDown className="mr-2 size-4" />}
            {showCustomize ? t('Hide customize') : t('Customize')}
          </Button>
          <Button variant="outline" onClick={onToggleDiagnostics} className="rounded-full">
            {showDiagnostics ? <ChevronUp className="mr-2 size-4" /> : <ChevronDown className="mr-2 size-4" />}
            {showDiagnostics ? t('Hide advanced') : t('Advanced')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RelayDiagnosticsCard({
  trackedRelays,
  activeRelayUrls
}: {
  trackedRelays: ReturnType<typeof client.getTrackedRelayStates>
  activeRelayUrls: string[]
}) {
  const { t } = useTranslation()
  const highlightedRelayUrlSet = useMemo(() => new Set(activeRelayUrls), [activeRelayUrls])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('Advanced diagnostics')}</CardTitle>
        <CardDescription>
          {t(
            'For troubleshooting and power users. These relay connections change as you move around the app.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {trackedRelays.length > 0 ? (
          <div className="space-y-2">
            {trackedRelays.slice(0, 8).map((relay) => (
              <div
                key={relay.url}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <RelayIcon url={relay.url} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{simplifyUrl(relay.url)}</div>
                    <div className="truncate text-xs text-muted-foreground">{relay.url}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      relay.connected
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {relay.connected ? t('Connected') : t('Tracked')}
                  </Badge>
                  {relay.subscriptionCount > 0 && (
                    <Badge variant="secondary">
                      {t('{{count}} live', {
                        count: relay.subscriptionCount,
                        defaultValue: '{{count}} live'
                      })}
                    </Badge>
                  )}
                  {highlightedRelayUrlSet.has(relay.url) && (
                    <Badge variant="outline">{t('In view')}</Badge>
                  )}
                </div>
              </div>
            ))}
            {trackedRelays.length > 8 && (
              <div className="text-xs text-muted-foreground">
                {t('{{count}} more relays active in this session.', {
                  count: trackedRelays.length - 8,
                  defaultValue: '{{count}} more relays active in this session.'
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            {t('Open a feed or relay view and active relay connections will show up here.')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NetworkStatusRow({
  title,
  statusLabel,
  toneClassName
}: {
  title: string
  statusLabel: string
  toneClassName: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3">
      <div className="min-w-0 flex-1 text-sm font-medium">{title}</div>
      <Badge variant="secondary" className={toneClassName}>
        {statusLabel}
      </Badge>
    </div>
  )
}

function SummaryBadge({
  label,
  value,
  toneClassName
}: {
  label: string
  value: number
  toneClassName: string
}) {
  return (
    <div className={`rounded-full px-3 py-1 text-xs font-medium ${toneClassName}`}>
      {label}: {value}
    </div>
  )
}
