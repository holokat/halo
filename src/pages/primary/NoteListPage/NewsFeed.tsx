import NormalFeed from '@/components/NormalFeed'
import { Button } from '@/components/ui/button'
import { toFeedsSettings } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { useFeed } from '@/providers/FeedProvider'
import { useWidgets } from '@/providers/WidgetsProvider'
import { useTranslation } from 'react-i18next'

export default function NewsFeed() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { feedInfo } = useFeed()
  const { newsWidgetRelays } = useWidgets()

  if (feedInfo.feedType !== 'news') {
    return null
  }

  if (newsWidgetRelays.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center">
        <div className="text-sm text-muted-foreground">
          {t('Add at least one news relay in Feeds settings to populate this feed.', {
            defaultValue: 'Add at least one news relay in Feeds settings to populate this feed.'
          })}
        </div>
        <Button onClick={() => push(toFeedsSettings())}>
          {t('Manage feeds', { defaultValue: 'Manage feeds' })}
        </Button>
      </div>
    )
  }

  return <NormalFeed subRequests={[{ urls: newsWidgetRelays, filter: {} }]} isMainFeed />
}
