import FollowingFavoriteRelayList from '@/components/FollowingFavoriteRelayList'
import PinButton from '@/components/PinButton'
import SearchBar from '@/components/SearchBar'
import SearchResult from '@/components/SearchResult'
import Tabs from '@/components/Tabs'
import { useFetchRelayInfo } from '@/hooks'
import { toRelay } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import relayInfoService from '@/services/relay-info.service'
import client from '@/services/client.service'
import { TAwesomeRelayCollection, TSearchParams } from '@/types'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RelaySimpleInfo, { RelaySimpleInfoSkeleton } from '../RelaySimpleInfo'
import TrendingNotes from '../TrendingNotes'

type TExploreTab = 'trending' | 'global-communities' | 'followed-favorites'
type TFavoriteRelayEntry = [string, string[]]

const GLOBAL_COLLECTION_IDS = new Set(['featured', 'global'])

export default function Explore({
  isInDeckView = false,
  input: controlledInput,
  setInput: controlledSetInput,
  searchParams: controlledSearchParams,
  onSearch: controlledOnSearch,
  showInlineSearch = true
}: {
  isInDeckView?: boolean
  input?: string
  setInput?: (input: string) => void
  searchParams?: TSearchParams | null
  onSearch?: (params: TSearchParams | null) => void
  showInlineSearch?: boolean
} = {}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const [localInput, setLocalInput] = useState('')
  const [localSearchParams, setLocalSearchParams] = useState<TSearchParams | null>(null)
  const [tab, setTab] = useState<TExploreTab>('trending')
  const [collections, setCollections] = useState<TAwesomeRelayCollection[] | null>(null)
  const [favoriteRelays, setFavoriteRelays] = useState<TFavoriteRelayEntry[]>([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)

  const input = controlledInput ?? localInput
  const searchParams = controlledSearchParams ?? localSearchParams
  const setInput = controlledSetInput ?? setLocalInput

  useEffect(() => {
    relayInfoService.getAwesomeRelayCollections().then(setCollections)
  }, [])

  useEffect(() => {
    if (!pubkey) {
      setFavoriteRelays([])
      setFavoritesLoading(false)
      return
    }

    setFavoritesLoading(true)
    client
      .fetchFollowingFavoriteRelays(pubkey)
      .then((relays) => setFavoriteRelays(relays ?? []))
      .finally(() => setFavoritesLoading(false))
  }, [pubkey])

  const { globalCollections, communityCollections } = useMemo(() => {
    const allCollections = collections ?? []
    return {
      globalCollections: allCollections.filter((collection) =>
        GLOBAL_COLLECTION_IDS.has(collection.id)
      ),
      communityCollections: allCollections.filter(
        (collection) => !GLOBAL_COLLECTION_IDS.has(collection.id)
      )
    }
  }, [collections])

  const handleSearch = (params: TSearchParams | null) => {
    if (controlledOnSearch) {
      controlledOnSearch(params)
    } else {
      setLocalSearchParams(params)
    }

    if (params?.input) {
      setInput(params.input)
    }
  }

  return (
    <div className="pb-4">
      {showInlineSearch && (
        <div className="px-4 pt-4 space-y-3">
          <div className="flex gap-2 items-center">
            <SearchBar
              onSearch={handleSearch}
              input={input}
              setInput={setInput}
              currentSearchParams={searchParams}
              searchInputClassName={
                isInDeckView
                  ? '!h-10 !rounded-xl !border !border-border/70 !bg-background/95 !px-3 !shadow-none'
                  : undefined
              }
            />
            {searchParams && (
              <PinButton
                column={{
                  type: 'search',
                  props: { searchParams }
                }}
              />
            )}
          </div>
          {searchParams && <SearchResult searchParams={searchParams} isInDeckView={isInDeckView} />}
        </div>
      )}

      {!showInlineSearch && searchParams && (
        <div className="px-4 pt-4">
          <SearchResult searchParams={searchParams} isInDeckView={isInDeckView} />
        </div>
      )}

      <Tabs
        value={tab}
        tabs={[
          { value: 'trending', label: 'Trending' },
          { value: 'global-communities', label: 'Global & Communities' },
          { value: 'followed-favorites', label: 'Followed Favorites' }
        ]}
        onTabChange={(nextTab) => setTab(nextTab as TExploreTab)}
        isInDeckView={isInDeckView}
      />

      {tab === 'trending' && <TrendingNotes showHeader={false} />}
      {tab === 'global-communities' && (
        <div className="space-y-8 px-4 pt-4">
          <CollectionGroup
            id="explore-global-feeds"
            title={t('Global feeds')}
            description="Widely-used relays and major public feeds across Nostr."
            collections={globalCollections}
          />
          <CollectionGroup
            id="explore-communities"
            title={t('Communities')}
            description="Interest-driven, language-focused, and curated community relays."
            collections={communityCollections}
          />
        </div>
      )}
      {tab === 'followed-favorites' && (
        <div className="pt-4">
          <div className="px-4 pb-3">
            <h2 className="text-lg font-semibold">{t('Followed Favorites')}</h2>
            <p className="text-sm text-muted-foreground">
              Relays that people you follow have explicitly saved as favorites.
            </p>
          </div>
          <FollowingFavoriteRelayList
            initialRelays={favoriteRelays}
            initialLoading={favoritesLoading}
          />
        </div>
      )}
    </div>
  )
}

function CollectionGroup({
  id,
  title,
  description,
  collections
}: {
  id?: string
  title: string
  description: string
  collections: TAwesomeRelayCollection[]
}) {
  if (!collections.length) {
    return (
      <div id={id} className="rounded-3xl border bg-card/60 p-5 scroll-mt-28">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        <div className="mt-6 space-y-2">
          <RelaySimpleInfoSkeleton className="h-auto rounded-2xl border px-4 py-3" />
        </div>
      </div>
    )
  }

  return (
    <section id={id} className="rounded-3xl border bg-card/60 p-5 scroll-mt-28">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-6">
        {collections.map((collection) => (
          <RelayCollection key={collection.id} collection={collection} />
        ))}
      </div>
    </section>
  )
}

function RelayCollection({ collection }: { collection: TAwesomeRelayCollection }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {collection.name}
        </div>
        <div className="text-sm text-muted-foreground">{collection.description}</div>
      </div>
      <div className="space-y-2">
        {collection.relays.map((url) => (
          <RelayItem key={url} url={url} />
        ))}
      </div>
    </div>
  )
}

function RelayItem({ url }: { url: string }) {
  const { push } = useSecondaryPage()
  const { relayInfo, isFetching } = useFetchRelayInfo(url)

  if (isFetching) {
    return <RelaySimpleInfoSkeleton className="h-auto rounded-2xl border px-4 py-3" />
  }

  if (!relayInfo) {
    return null
  }

  return (
    <RelaySimpleInfo
      key={relayInfo.url}
      className="clickable h-auto rounded-2xl border px-4 py-3"
      relayInfo={relayInfo}
      compact
      showPinButton
      onClick={(e) => {
        e.stopPropagation()
        push(toRelay(relayInfo.url))
      }}
    />
  )
}
