import BookmarkList from '@/components/BookmarkList'
import NormalFeed from '@/components/NormalFeed'
import PostEditor from '@/components/PostEditor'
import RelayInfo from '@/components/RelayInfo'
import PinButton from '@/components/PinButton'
import TrendingNotes from '@/components/TrendingNotes'
import { Button } from '@/components/ui/button'
import {
  getCustomFeedSubRequests,
  shouldBypassHashtagLimitForCustomFeed,
  shouldBypassTrustFilterForCustomFeed
} from '@/lib/custom-feed'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { TPageRef } from '@/types'
import { Info, Plus } from 'lucide-react'
import {
  Dispatch,
  forwardRef,
  SetStateAction,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import SlowConnectionToggle from '@/components/Titlebar/SlowConnectionToggle'
import FeedButton from './FeedButton'
import FollowingFeed from './FollowingFeed'
import NewsFeed from './NewsFeed'
import PollsFeed from './PollsFeed'
import RelaysFeed from './RelaysFeed'
import OneNotePerPersonFeed from './OneNotePerPersonFeed'

const NoteListPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { addRelayUrls, removeRelayUrls } = useCurrentRelays()
  const layoutRef = useRef<TPageRef>(null)
  const { pubkey, checkLogin } = useNostr()
  const { feedInfo, relayUrls, isReady } = useFeed()
  const { customFeeds } = useCustomFeeds()
  const [showRelayDetails, setShowRelayDetails] = useState(false)
  useImperativeHandle(ref, () => layoutRef.current)

  useEffect(() => {
    if (layoutRef.current) {
      layoutRef.current.scrollToTop('instant')
    }
  }, [JSON.stringify(relayUrls), feedInfo])

  useEffect(() => {
    if (relayUrls.length) {
      addRelayUrls(relayUrls)
      return () => {
        removeRelayUrls(relayUrls)
      }
    }
  }, [relayUrls])

  let content: React.ReactNode = null
  if (!isReady) {
    content = <div className="text-center text-sm text-muted-foreground">{t('loading...')}</div>
  } else if (feedInfo.feedType === 'following' && !pubkey) {
    content = (
      <div className="flex justify-center w-full">
        <Button size="lg" onClick={() => checkLogin()}>
          {t('Please login to view following feed')}
        </Button>
      </div>
    )
  } else if (feedInfo.feedType === 'bookmarks') {
    if (!pubkey) {
      content = (
        <div className="flex justify-center w-full">
          <Button size="lg" onClick={() => checkLogin()}>
            {t('Please login to view bookmarks')}
          </Button>
        </div>
      )
    } else {
      content = <BookmarkList />
    }
  } else if (feedInfo.feedType === 'polls') {
    if (!pubkey) {
      content = (
        <div className="flex justify-center w-full">
          <Button size="lg" onClick={() => checkLogin()}>
            {t('Please login to view polls', { defaultValue: 'Please login to view polls' })}
          </Button>
        </div>
      )
    } else {
      content = <PollsFeed />
    }
  } else if (feedInfo.feedType === 'custom') {
    const customFeed = customFeeds.find((f) => f.id === feedInfo.id)
    if (!customFeed) {
      content = (
        <div className="text-center text-sm text-muted-foreground">
          {t('Custom feed not found')}
        </div>
      )
    } else {
      // Render the feed based on search params
      const subRequests = getCustomFeedSubRequests(customFeed)
      if (subRequests.length > 0) {
        content = (
          <NormalFeed
            subRequests={subRequests}
            showRelayCloseReason
            initialEoseThreshold={1}
            hideUntrustedNotes={
              shouldBypassTrustFilterForCustomFeed(customFeed.id) ? false : undefined
            }
            ignoreHashtagLimit={shouldBypassHashtagLimitForCustomFeed(customFeed.id)}
          />
        )
      } else {
        content = (
          <div className="text-center text-sm text-muted-foreground">
            {t('Custom feed has no filters configured')}
          </div>
        )
      }
    }
  } else if (feedInfo.feedType === 'following') {
    content = <FollowingFeed />
  } else if (feedInfo.feedType === 'trending') {
    content = <TrendingNotes showHeader={false} />
  } else if (feedInfo.feedType === 'news') {
    content = <NewsFeed />
  } else if (feedInfo.feedType === 'one-per-person') {
    if (!pubkey) {
      content = (
        <div className="flex justify-center w-full">
          <Button size="lg" onClick={() => checkLogin()}>
            {t('Please login to view latest note feed')}
          </Button>
        </div>
      )
    } else {
      content = <OneNotePerPersonFeed />
    }
  } else {
    content = (
      <>
        {showRelayDetails && feedInfo.feedType === 'relay' && !!feedInfo.id && (
          <RelayInfo url={feedInfo.id!} className="mb-2 pt-3" />
        )}
        <RelaysFeed />
      </>
    )
  }

  return (
    <PrimaryPageLayout
      pageName="home"
      ref={layoutRef}
      titlebar={
        <NoteListPageTitlebar
          layoutRef={layoutRef}
          showRelayDetails={showRelayDetails}
          setShowRelayDetails={
            feedInfo.feedType === 'relay' && !!feedInfo.id ? setShowRelayDetails : undefined
          }
        />
      }
      displayScrollToTopButton
    >
      {content}
    </PrimaryPageLayout>
  )
})
NoteListPage.displayName = 'NoteListPage'
export default NoteListPage

function NoteListPageTitlebar({
  layoutRef,
  showRelayDetails,
  setShowRelayDetails
}: {
  layoutRef?: React.RefObject<TPageRef>
  showRelayDetails?: boolean
  setShowRelayDetails?: Dispatch<SetStateAction<boolean>>
}) {
  const { isSmallScreen } = useScreenSize()
  const { feedInfo } = useFeed()
  const { customFeeds } = useCustomFeeds()

  // Determine pin button based on feed type
  let pinButton: React.ReactNode = null

  if (feedInfo.feedType === 'bookmarks') {
    pinButton = <PinButton column={{ type: 'bookmarks' }} size="titlebar-icon" />
  } else if (feedInfo.feedType === 'relay' && feedInfo.id) {
    pinButton = (
      <PinButton column={{ type: 'relay', props: { url: feedInfo.id } }} size="titlebar-icon" />
    )
  } else if (feedInfo.feedType === 'relays' && feedInfo.id) {
    pinButton = (
      <PinButton
        column={{ type: 'relays', props: { activeRelaySetId: feedInfo.id } }}
        size="titlebar-icon"
      />
    )
  } else if (feedInfo.feedType === 'custom' && feedInfo.id) {
    const customFeed = customFeeds.find((f) => f.id === feedInfo.id)
    if (customFeed) {
      pinButton = (
        <PinButton
          column={{ type: 'custom', props: { customFeedId: feedInfo.id } }}
          size="titlebar-icon"
        />
      )
    }
  }

  if (isSmallScreen) {
    return (
      <div className="grid h-full w-full grid-cols-[1fr_auto] items-center gap-2 pl-1">
        <div className="min-w-0">
          <FeedButton className="max-w-[min(74vw,20rem)]" />
        </div>
        <div className="shrink-0 flex gap-1 items-center">
          <SlowConnectionToggle />
          <HomeComposeButton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-1 items-center h-full justify-between">
      <FeedButton className="flex-1 max-w-fit w-0" />
      <div className="shrink-0 flex gap-1 items-center">
        {pinButton}
        {setShowRelayDetails && (
          <Button
            variant="ghost"
            size="titlebar-icon"
            onClick={(e) => {
              e.stopPropagation()
              setShowRelayDetails((show) => !show)

              if (!showRelayDetails) {
                layoutRef?.current?.scrollToTop('smooth')
              }
            }}
            className={showRelayDetails ? 'bg-accent/50' : ''}
          >
            <Info />
          </Button>
        )}
        <HomeComposeButton />
      </div>
    </div>
  )
}

function HomeComposeButton() {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="titlebar-icon"
        onClick={(event) => {
          event.stopPropagation()
          checkLogin(() => setOpen(true))
        }}
        aria-label={t('New note', { defaultValue: 'New note' })}
        title={t('New note', { defaultValue: 'New note' })}
      >
        <Plus />
      </Button>
      <PostEditor open={open} setOpen={setOpen} />
    </>
  )
}
