import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import ArticleList, { TArticleListRef } from '@/components/ArticleList'
import MediaGrid, { TMediaGridRef } from '@/components/MediaGrid'
import Tabs from '@/components/Tabs'
import { BIG_RELAY_URLS, MAX_PINNED_NOTES } from '@/constants'
import { generateBech32IdFromETag } from '@/lib/tag'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReadsVisibility } from '@/providers/ReadsVisibilityProvider'
import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { NostrEvent } from 'nostr-tools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'
import { buildProfileFeedTabs } from './profile-feed-tabs'

export default function ProfileFeed({
  pubkey,
  topSpace = 0,
  isInDeckView = false
}: {
  pubkey: string
  topSpace?: number
  isInDeckView?: boolean
}) {
  const { pubkey: myPubkey, pinListEvent: myPinListEvent, relayList: myRelayList } = useNostr()
  const { showKinds } = useKindFilter()
  const { hideReadsInProfiles } = useReadsVisibility()
  const { lowBandwidthMode } = useLowBandwidthMode()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([])
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([])
  const tabs = useMemo(
    () =>
      buildProfileFeedTabs({
        lowBandwidthMode,
        myPubkey,
        pubkey,
        showReadsInProfiles: !hideReadsInProfiles
      }),
    [myPubkey, pubkey, hideReadsInProfiles, lowBandwidthMode]
  )
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const noteListRef = useRef<TNoteListRef>(null)
  const articleListRef = useRef<TArticleListRef>(null)
  const mediaGridRef = useRef<TMediaGridRef>(null)

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === listMode)) {
      setListMode('posts')
    }
  }, [listMode, tabs])

  useEffect(() => {
    const initPinnedEventIds = async () => {
      let evt: NostrEvent | null = null
      if (pubkey === myPubkey) {
        evt = myPinListEvent
      } else {
        evt = await client.fetchPinListEvent(pubkey)
      }
      const hexIdSet = new Set<string>()
      const ids =
        (evt?.tags
          .filter((tag) => tag[0] === 'e')
          .reverse()
          .slice(0, MAX_PINNED_NOTES)
          .map((tag) => {
            const [, hexId, relay, _pubkey] = tag
            if (!hexId || hexIdSet.has(hexId) || (_pubkey && _pubkey !== pubkey)) {
              return undefined
            }

            const id = generateBech32IdFromETag(['e', hexId, relay ?? '', pubkey])
            if (id) {
              hexIdSet.add(hexId)
            }
            return id
          })
          .filter(Boolean) as string[]) ?? []
      setPinnedEventIds(ids)
    }
    initPinnedEventIds()
  }, [pubkey, myPubkey, myPinListEvent])

  useEffect(() => {
    const init = async () => {
      // Clear events when changing modes or pubkey
      setAllEvents([])
      mediaGridRef.current?.clearEvents()

      if (listMode === 'you') {
        if (!myPubkey) {
          setSubRequests([])
          return
        }

        const [relayList, myRelayList] = await Promise.all([
          client.fetchRelayList(pubkey),
          client.fetchRelayList(myPubkey)
        ])

        setSubRequests([
          {
            urls: myRelayList.write.concat(BIG_RELAY_URLS).slice(0, 5),
            filter: {
              authors: [myPubkey],
              '#p': [pubkey]
            }
          },
          {
            urls: relayList.write.concat(BIG_RELAY_URLS).slice(0, 5),
            filter: {
              authors: [pubkey],
              '#p': [myPubkey]
            }
          }
        ])
        return
      }

      const relayList =
        pubkey === myPubkey && myRelayList ? myRelayList : await client.fetchRelayList(pubkey)
      setSubRequests([
        {
          urls: relayList.write.concat(BIG_RELAY_URLS).slice(0, 8),
          filter: {
            authors: [pubkey]
          }
        }
      ])
    }
    init()
  }, [pubkey, listMode, myPubkey, myRelayList])

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
    articleListRef.current?.scrollToTop('smooth')
    mediaGridRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop('instant')
  }

  return (
    <>
      <Tabs
        value={listMode}
        tabs={tabs}
        onTabChange={(listMode) => {
          handleListModeChange(listMode as TNoteListMode)
        }}
        threshold={Math.max(800, topSpace)}
        options={
          <>
            {!supportTouch && listMode !== 'reads' && listMode !== 'media' && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            {!supportTouch && listMode === 'reads' && <RefreshButton onClick={() => articleListRef.current?.refresh()} />}
            {!supportTouch && listMode === 'media' && <RefreshButton onClick={() => mediaGridRef.current?.refresh()} />}
            {listMode !== 'reads' && listMode !== 'media' && (
              <KindFilter
                showKinds={temporaryShowKinds}
                onShowKindsChange={handleShowKindsChange}
                mediaOnly={false}
                onMediaOnlyChange={() => {}}
              />
            )}
          </>
        }
        isInDeckView={isInDeckView}
      />
      {listMode === 'reads' ? (
        <ArticleList
          ref={articleListRef}
          subRequests={subRequests}
        />
      ) : listMode === 'media' ? (
        <MediaGrid
          ref={mediaGridRef}
          subRequests={subRequests}
        />
      ) : null}
      {listMode !== 'reads' && listMode !== 'media' && (
        <NoteList
          ref={noteListRef}
          subRequests={subRequests}
          showKinds={temporaryShowKinds}
          hideReplies={listMode === 'posts'}
          filterMutedNotes={false}
          pinnedEventIds={listMode === 'you' ? [] : pinnedEventIds}
          onEventsChange={(events) => {
            if (listMode === 'posts' || listMode === 'postsAndReplies' || listMode === 'you') {
              mediaGridRef.current?.addEvents(events)
            }
          }}
        />
      )}
    </>
  )
}
