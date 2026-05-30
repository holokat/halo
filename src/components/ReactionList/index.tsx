import { useSecondaryPage } from '@/PageManager'
import { useNoteStatsById } from '@/hooks/useNoteStatsById'
import { getReactionDisplayEmoji } from '@/lib/reaction'
import { toProfile } from '@/lib/link'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { Event } from 'nostr-tools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Emoji from '../Emoji'
import { FormattedTimestamp } from '../FormattedTimestamp'
import UserAvatar from '../UserAvatar'
import Username from '../Username'

const SHOW_COUNT = 20

export default function ReactionList({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { isSmallScreen } = useScreenSize()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const noteStats = useNoteStatsById(event.id)
  const filteredLikes = useMemo(() => {
    return (noteStats?.likes ?? [])
      .filter((like) => !hideUntrustedInteractions || isUserTrustedForInteractions(like.pubkey))
      .sort((a, b) => b.created_at - a.created_at)
  }, [noteStats, event.id, hideUntrustedInteractions, isUserTrustedForInteractions])

  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!bottomRef.current || filteredLikes.length <= showCount) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShowCount((c) => c + SHOW_COUNT)
      },
      { rootMargin: '10px', threshold: 0.1 }
    )
    obs.observe(bottomRef.current)
    return () => obs.disconnect()
  }, [filteredLikes.length, showCount])

  return (
    <div className="min-h-[80vh]">
      {filteredLikes.slice(0, showCount).map((like) => (
        <div
          key={like.id}
          className="px-4 py-3 border-b transition-colors clickable flex items-center gap-3"
          onClick={() => push(toProfile(like.pubkey))}
        >
          <div className="w-6 flex flex-col items-center">
            <Emoji
              emoji={getReactionDisplayEmoji(like.emoji)}
              classNames={{
                text: 'text-xl'
              }}
            />
            {like.bonusCount > 0 && (
              <span className="mt-1 text-[10px] font-semibold text-primary/90">+{like.bonusCount}</span>
            )}
          </div>

          <UserAvatar userId={like.pubkey} size="medium" className="shrink-0" />

          <div className="flex-1 w-0">
            <Username
              userId={like.pubkey}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground max-w-fit truncate"
              skeletonClassName="h-3"
            />
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <FormattedTimestamp
                timestamp={like.created_at}
                className="shrink-0"
                short={isSmallScreen}
              />
            </div>
          </div>
        </div>
      ))}

      <div ref={bottomRef} />

      <div className="text-sm mt-2 text-center text-muted-foreground">
        {filteredLikes.length > 0 ? t('No more reactions') : t('No reactions yet')}
      </div>
    </div>
  )
}
