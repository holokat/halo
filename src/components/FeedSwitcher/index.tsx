import { cn } from '@/lib/utils'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Bookmark, TrendingUp, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function FeedSwitcher({ close }: { close?: () => void }) {
  const { t } = useTranslation()
  const { pubkey, checkLogin } = useNostr()
  const { feedInfo, switchFeed } = useFeed()

  const switchAuthenticatedFeed = (feedType: 'following' | 'bookmarks') => {
    if (!pubkey) {
      void checkLogin()
      close?.()
      return
    }

    void switchFeed(feedType, { pubkey })
    close?.()
  }

  return (
    <div className="space-y-2">
      <FeedOption
        icon={<UsersRound />}
        label={t('Following')}
        active={feedInfo.feedType === 'following'}
        onClick={() => switchAuthenticatedFeed('following')}
      />
      <FeedOption
        icon={<TrendingUp />}
        label={t('Trending')}
        active={feedInfo.feedType === 'trending'}
        onClick={() => {
          void switchFeed('trending')
          close?.()
        }}
      />
      <FeedOption
        icon={<Bookmark />}
        label={t('Saved', { defaultValue: 'Saved' })}
        active={feedInfo.feedType === 'bookmarks'}
        onClick={() => switchAuthenticatedFeed('bookmarks')}
      />
    </div>
  )
}

function FeedOption({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-2xl border px-4 text-left text-sm font-semibold transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/70 hover:bg-accent/60'
      )}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="flex size-6 items-center justify-center [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  )
}
