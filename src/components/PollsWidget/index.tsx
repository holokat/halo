import ResizableWidgetBody from '@/components/ResizableWidgetBody'
import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EyeOff, RefreshCcw } from 'lucide-react'
import { useSecondaryPage } from '@/PageManager'
import { cn } from '@/lib/utils'
import { toNote } from '@/lib/link'
import { CompactPollCard } from './CompactPollCard'
import { EmptyState } from './EmptyState'
import { usePollWidgetData } from './usePollWidgetData'

const WIDGET_HEIGHT_CLASS = 'max-h-[420px]'

export default function PollsWidget() {
  const { push } = useSecondaryPage()
  const {
    activeItems,
    activeTab,
    currentItems,
    endedItems,
    emptyTabText,
    fetchPolls,
    followings,
    hideWidgetTitles,
    isCollapsed,
    isHovered,
    loading,
    now,
    pubkey,
    refreshing,
    setActiveTab,
    setIsHovered,
    t,
    toggleWidget,
    trackedPollEvents,
    votedItems,
    widgetName
  } = usePollWidgetData()

  return (
    <WidgetContainer className="flex flex-col">
      <WidgetHeader
        widgetId="polls"
        title={widgetName}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        titleActions={
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
            onClick={() => void fetchPolls()}
            title={t('Refresh polls', { defaultValue: 'Refresh polls' })}
            aria-label={t('Refresh polls', { defaultValue: 'Refresh polls' })}
            disabled={loading || refreshing}
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', (loading || refreshing) && 'animate-spin')} />
          </button>
        }
        actions={
          isHovered ? (
            <button
              type="button"
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => toggleWidget('polls')}
              title={t('Hide widget', { defaultValue: 'Hide widget' })}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />

      {!isCollapsed && (
        <ResizableWidgetBody
          widgetId="polls"
          minHeight={220}
          maxHeight={820}
          className={cn(
            WIDGET_HEIGHT_CLASS,
            'overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y scrollbar-hide px-4 pb-4',
            hideWidgetTitles ? 'pt-4' : ''
          )}
        >
          {loading ? (
            <div className="space-y-2.5 pt-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="mb-2 h-4 w-full" />
                  <Skeleton className="mb-2 h-4 w-3/4" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-7 w-full rounded-md" />
                    <Skeleton className="h-7 w-full rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : !pubkey ? (
            <EmptyState
              text={t('Log in and follow people to see polls in this widget.', {
                defaultValue: 'Log in and follow people to see polls in this widget.'
              })}
            />
          ) : followings.length === 0 ? (
            <EmptyState
              text={t('Follow people to see their polls here.', {
                defaultValue: 'Follow people to see their polls here.'
              })}
            />
          ) : trackedPollEvents.length === 0 ? (
            <EmptyState
              text={t('No polls from people you follow right now.', {
                defaultValue: 'No polls from people you follow right now.'
              })}
            />
          ) : (
            <div className="pt-1">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList className="grid h-8 w-full grid-cols-3 rounded-full bg-muted/40 p-1">
                  <TabsTrigger value="active" className="gap-1 rounded-full px-2 text-[11px]">
                    <span>{t('Active', { defaultValue: 'Active' })}</span>
                    <span className="text-[10px] text-muted-foreground">{activeItems.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="voted" className="gap-1 rounded-full px-2 text-[11px]">
                    <span>{t('Voted', { defaultValue: 'Voted' })}</span>
                    <span className="text-[10px] text-muted-foreground">{votedItems.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="ended" className="gap-1 rounded-full px-2 text-[11px]">
                    <span>{t('Ended', { defaultValue: 'Ended' })}</span>
                    <span className="text-[10px] text-muted-foreground">{endedItems.length}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {currentItems.length === 0 ? (
                <EmptyState className="mt-2" text={emptyTabText} />
              ) : (
                <div className="mt-2 space-y-2">
                  {currentItems.map((item) => (
                    <CompactPollCard
                      key={item.event.id}
                      event={item.event}
                      poll={item.poll}
                      now={now}
                      commentCount={item.commentCount}
                      votedOptionIds={item.votedOptionIds}
                      isExpired={item.isExpired}
                      onOpen={() => push(toNote(item.event))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ResizableWidgetBody>
      )}
    </WidgetContainer>
  )
}
