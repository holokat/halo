import ResizableWidgetBody from '@/components/ResizableWidgetBody'
import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import { useWidgets, AVAILABLE_WIDGETS } from '@/providers/WidgetsProvider'
import CompactTrendingNotes from './CompactTrendingNotes'
import { EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toRelay } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'

const HEIGHT_CLASSES = {
  short: 'max-h-[220px]',
  medium: 'max-h-[320px]',
  tall: 'max-h-[480px]',
  remaining: 'h-full'
}

const TRENDING_RELAY_URL = 'wss://trending.relays.land'

export default function TrendingNotesWidget() {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const {
    trendingNotesHeight,
    enabledWidgets,
    toggleWidget,
    hideWidgetTitles,
    isWidgetCollapsed
  } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)

  // Check if trending notes is the only enabled widget
  // (other widgets could be pinned notes or bitcoin ticker)
  const otherWidgets = enabledWidgets.filter(id => id !== 'trending-notes')
  const isOnlyWidget = otherWidgets.length === 0

  // Keep short mode truly compact even when this is the only widget.
  // Preserve the old full-height behavior for other presets when it's alone.
  const forceFullHeight = isOnlyWidget && trendingNotesHeight !== 'short'
  const heightClass = forceFullHeight ? 'h-full' : HEIGHT_CLASSES[trendingNotesHeight]

  // Get the widget name from AVAILABLE_WIDGETS
  const widgetName = AVAILABLE_WIDGETS.find(w => w.id === 'trending-notes')?.name || 'Trending Notes'

  // Use full height for container if 'remaining' is selected or when forced above.
  const useFullHeight = trendingNotesHeight === 'remaining' || forceFullHeight
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('trending-notes')

  const handleTitleClick = () => {
    push(toRelay(TRENDING_RELAY_URL))
  }

  return (
    <WidgetContainer className={useFullHeight && !isCollapsed ? 'h-full min-h-0 flex flex-col' : 'min-h-0 flex flex-col'}>
      <WidgetHeader
        widgetId="trending-notes"
        title={widgetName}
        titleClassName="cursor-pointer hover:text-primary"
        onTitleClick={handleTitleClick}
        titleTooltip={t('View full trending feed')}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        actions={
          isHovered ? (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={(event) => {
                event.stopPropagation()
                toggleWidget('trending-notes')
              }}
              title={t('Hide widget')}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />
      {!isCollapsed && (
        <ResizableWidgetBody
          widgetId="trending-notes"
          minHeight={180}
          maxHeight={900}
          disabled={useFullHeight}
          className={`${heightClass} min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y scrollbar-thin px-4 ${hideWidgetTitles ? 'pt-4' : ''} pb-4 ${useFullHeight ? 'flex-1' : ''}`}
        >
          <CompactTrendingNotes />
        </ResizableWidgetBody>
      )}
    </WidgetContainer>
  )
}
