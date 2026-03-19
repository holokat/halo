import { MouseEventHandler, ReactNode } from 'react'
import { CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useWidgets } from '@/providers/WidgetsProvider'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type WidgetHeaderProps = {
  widgetId: string
  title: ReactNode
  titleActions?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
  onTitleClick?: () => void
  titleTooltip?: string
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

export default function WidgetHeader({
  widgetId,
  title,
  titleActions,
  actions,
  className,
  titleClassName,
  onTitleClick,
  titleTooltip,
  onMouseEnter,
  onMouseLeave
}: WidgetHeaderProps) {
  const { t } = useTranslation()
  const { hideWidgetTitles, isWidgetCollapsed, toggleWidgetCollapsed } = useWidgets()

  if (hideWidgetTitles) {
    return null
  }

  const isCollapsed = isWidgetCollapsed(widgetId)
  const collapseLabel = isCollapsed
    ? t('Expand widget', { defaultValue: 'Expand widget' })
    : t('Collapse widget', { defaultValue: 'Collapse widget' })

  return (
    <CardHeader
      className={cn(
        'group flex flex-row items-center justify-between space-y-0 border-b p-4 pb-3',
        className
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            toggleWidgetCollapsed(widgetId)
          }}
          title={collapseLabel}
          aria-label={collapseLabel}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {onTitleClick ? (
          <button
            type="button"
            className={cn(
              'min-w-0 flex-1 text-left text-sm font-semibold leading-none transition-colors',
              titleClassName
            )}
            onClick={onTitleClick}
            title={titleTooltip}
          >
            {title}
          </button>
        ) : (
          <div
            className={cn('min-w-0 flex-1 text-sm font-semibold leading-none', titleClassName)}
            title={titleTooltip}
          >
            {title}
          </div>
        )}

        {titleActions ? <div className="flex shrink-0 items-center gap-1">{titleActions}</div> : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </CardHeader>
  )
}
