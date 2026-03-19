import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import BitcoinTicker from './index'
import { AVAILABLE_WIDGETS, useWidgets } from '@/providers/WidgetsProvider'
import { EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function BitcoinTickerWidget() {
  const { t } = useTranslation()
  const { toggleWidget, hideWidgetTitles, isWidgetCollapsed } = useWidgets()
  const [isHovered, setIsHovered] = useState(false)

  // Get the widget name from AVAILABLE_WIDGETS
  const widgetName = AVAILABLE_WIDGETS.find(w => w.id === 'bitcoin-ticker')?.name || 'Bitcoin Ticker'
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed('bitcoin-ticker')

  return (
    <WidgetContainer>
      <WidgetHeader
        widgetId="bitcoin-ticker"
        title={widgetName}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        actions={
          isHovered ? (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={() => toggleWidget('bitcoin-ticker')}
              title={t('Hide widget')}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />
      {!isCollapsed && <BitcoinTicker />}
    </WidgetContainer>
  )
}
