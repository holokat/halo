import FeedSwitcher from '@/components/FeedSwitcher'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { getCustomFeedHashtags, INTERESTS_FEED_ID } from '@/lib/custom-feed'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { simplifyUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { useCustomFeeds } from '@/providers/CustomFeedsProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import {
  BarChart3,
  BookmarkIcon,
  Box,
  ChevronDown,
  Hash,
  Newspaper,
  Search,
  TrendingUp,
  UserRound,
  UsersRound
} from 'lucide-react'
import { forwardRef, HTMLAttributes, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function FeedButton({ className }: { className?: string }) {
  const { isSmallScreen } = useScreenSize()
  const [open, setOpen] = useState(false)

  if (isSmallScreen) {
    return (
      <>
        <FeedSwitcherTrigger className={className} onClick={() => setOpen(true)} />
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[80vh]">
            <div
              className="overflow-y-auto overscroll-contain py-2 px-4"
              style={{ touchAction: 'pan-y' }}
            >
              <FeedSwitcher close={() => setOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FeedSwitcherTrigger className={className} />
      </PopoverTrigger>
      <PopoverContent sideOffset={0} side="bottom" className="w-72 p-3">
        <FeedSwitcher close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

const FeedSwitcherTrigger = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { t } = useTranslation()
    const { feedInfo, relayUrls } = useFeed()
    const { relaySets } = useFavoriteRelays()
    const { customFeeds } = useCustomFeeds()
    const activeRelaySet = useMemo(() => {
      return feedInfo.feedType === 'relays' && feedInfo.id
        ? relaySets.find((set) => set.id === feedInfo.id)
        : undefined
    }, [feedInfo, relaySets])
    const activeCustomFeed = useMemo(() => {
      return feedInfo.feedType === 'custom' && feedInfo.id
        ? customFeeds.find((feed) => feed.id === feedInfo.id)
        : undefined
    }, [feedInfo, customFeeds])
    const title = useMemo(() => {
      if (feedInfo.feedType === 'following') {
        return t('Following')
      }
      if (feedInfo.feedType === 'trending') {
        return t('Trending')
      }
      if (feedInfo.feedType === 'news') {
        return t('News', { defaultValue: 'News' })
      }
      if (feedInfo.feedType === 'bookmarks') {
        return t('Saved', { defaultValue: 'Saved' })
      }
      if (feedInfo.feedType === 'polls') {
        return t('Polls')
      }
      if (feedInfo.feedType === 'one-per-person') {
        return t('Latest Note')
      }
      if (feedInfo.feedType === 'custom') {
        if (feedInfo.id === INTERESTS_FEED_ID) {
          return t('Interests', { defaultValue: 'Interests' })
        }
        return activeCustomFeed?.name ?? t('Custom Feed')
      }
      if (feedInfo.feedType === 'relay') {
        return simplifyUrl(feedInfo.id ?? '')
      }
      if (feedInfo.feedType === 'relays') {
        return activeRelaySet?.name ?? activeRelaySet?.id
      }
      // Fallback
      return t('Choose a relay')
    }, [feedInfo, activeRelaySet, activeCustomFeed, relayUrls])

    const icon = useMemo(() => {
      if (feedInfo.feedType === 'following') {
        return <UsersRound />
      }
      if (feedInfo.feedType === 'trending') {
        return <TrendingUp />
      }
      if (feedInfo.feedType === 'news') {
        return <Newspaper />
      }
      if (feedInfo.feedType === 'bookmarks') {
        return <BookmarkIcon />
      }
      if (feedInfo.feedType === 'polls') {
        return <BarChart3 />
      }
      if (feedInfo.feedType === 'one-per-person') {
        return <UserRound />
      }
      if (feedInfo.feedType === 'custom') {
        if (feedInfo.id === INTERESTS_FEED_ID) {
          return <Hash />
        }
        if (activeCustomFeed && getCustomFeedHashtags(activeCustomFeed).length > 0) {
          return <Hash />
        }
        return <Search />
      }
      return <Box />
    }, [feedInfo, activeCustomFeed])

    return (
      <div
        className={cn(
          'flex items-center gap-2 clickable px-3 h-full rounded-2xl [&_svg]:text-muted-foreground',
          className
        )}
        ref={ref}
        {...props}
      >
        {icon}
        <div
          className="text-lg font-semibold truncate"
          style={{ fontSize: `var(--title-font-size, 18px)` }}
        >
          {title}
        </div>
        <ChevronDown />
      </div>
    )
  }
)
