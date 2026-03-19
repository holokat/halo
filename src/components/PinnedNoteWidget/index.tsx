import WidgetContainer from '@/components/WidgetContainer'
import WidgetHeader from '@/components/WidgetHeader'
import NoteCard from '@/components/NoteCard'
import { useWidgets } from '@/providers/WidgetsProvider'
import { useFetchEvent } from '@/hooks/useFetchEvent'
import { Loader2, Pin, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import React from 'react'

interface PinnedNoteWidgetProps {
  widgetId: string
  eventId: string
}

export default function PinnedNoteWidget({ widgetId, eventId }: PinnedNoteWidgetProps) {
  const { t } = useTranslation()
  const { unpinNoteWidget, hideWidgetTitles, isWidgetCollapsed } = useWidgets()
  const { event, isFetching } = useFetchEvent(eventId)
  const [isHovered, setIsHovered] = React.useState(false)
  const isCollapsed = !hideWidgetTitles && isWidgetCollapsed(widgetId)

  const handleUnpin = () => {
    unpinNoteWidget(widgetId)
  }

  return (
    <WidgetContainer>
      <WidgetHeader
        widgetId={widgetId}
        title={
          <>
            <Pin className="h-4 w-4" />
            <span>{t('Pinned Note')}</span>
          </>
        }
        titleClassName="flex items-center gap-2"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        actions={
          isHovered ? (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={handleUnpin}
              title={t('Unpin from sidebar')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />
      {!isCollapsed && (
        <div className={`px-4 ${hideWidgetTitles ? 'pt-4' : ''} pb-4`}>
          {isFetching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isFetching && !event && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t('Note not found')}
            </div>
          )}
          {event && <NoteCard event={event} hideSeparator />}
        </div>
      )}
    </WidgetContainer>
  )
}
