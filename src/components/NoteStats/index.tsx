import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import noteStatsService from '@/services/note-stats.service'
import { Event } from 'nostr-tools'
import { useEffect, useState } from 'react'
import BookmarkButton from '../BookmarkButton'
import BookmarkTagManager from '../BookmarkTagManager'
import LikeButton from './LikeButton'
import Likes from './Likes'
import ReplyButton from './ReplyButton'
import RepostButton from './RepostButton'
import ShareButton from './ShareButton'

export default function NoteStats({
  event,
  className,
  classNames,
  fetchIfNotExisting = false,
  displayTopLikes = false,
  onTagsChange,
  bookmarkId
}: {
  event: Event
  className?: string
  classNames?: {
    buttonBar?: string
  }
  fetchIfNotExisting?: boolean
  displayTopLikes?: boolean
  onTagsChange?: () => void
  bookmarkId?: string
}) {
  const { isSmallScreen } = useScreenSize()
  const { pubkey } = useNostr()
  const { lowBandwidthMode } = useLowBandwidthMode()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fetchIfNotExisting || lowBandwidthMode) return
    setLoading(true)
    noteStatsService.fetchNoteStats(event, pubkey).finally(() => setLoading(false))
  }, [event, fetchIfNotExisting, lowBandwidthMode, pubkey])

  if (isSmallScreen) {
    return (
      <div className={cn('select-none', className)}>
        {!lowBandwidthMode && displayTopLikes && <Likes event={event} />}
        <div
          className={cn(
            'flex justify-between items-center h-5 [&_svg]:size-5',
            classNames?.buttonBar
          )}
        >
          <div
            className={cn('flex items-center', loading ? 'animate-pulse' : '')}
            onClick={(e) => e.stopPropagation()}
          >
            <ReplyButton event={event} />
            <RepostButton event={event} />
            <ShareButton event={event} />
            {!lowBandwidthMode && <LikeButton event={event} />}
          </div>
          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            <BookmarkButton event={event} />
            <BookmarkTagManager event={event} onTagsChange={onTagsChange} bookmarkId={bookmarkId} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('select-none', className)}>
      {!lowBandwidthMode && displayTopLikes && <Likes event={event} />}
      <div className="flex justify-between h-5 [&_svg]:size-4">
        <div
          className={cn('flex items-center', loading ? 'animate-pulse' : '')}
          onClick={(e) => e.stopPropagation()}
        >
          <ReplyButton event={event} />
          <RepostButton event={event} />
          <ShareButton event={event} />
          {!lowBandwidthMode && <LikeButton event={event} />}
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <BookmarkButton event={event} />
          <BookmarkTagManager event={event} onTagsChange={onTagsChange} bookmarkId={bookmarkId} />
        </div>
      </div>
    </div>
  )
}
