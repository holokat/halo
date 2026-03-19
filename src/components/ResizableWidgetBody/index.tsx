import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { cn } from '@/lib/utils'
import { useWidgets } from '@/providers/WidgetsProvider'

const DEFAULT_MIN_HEIGHT = 120
const DEFAULT_MAX_HEIGHT = 900

type ResizableWidgetBodyProps = {
  widgetId: string
  children: ReactNode
  className?: string
  minHeight?: number
  maxHeight?: number
  disabled?: boolean
}

export default function ResizableWidgetBody({
  widgetId,
  children,
  className,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  disabled = false
}: ResizableWidgetBodyProps) {
  const { getWidgetHeight, setWidgetHeight, clearWidgetHeight } = useWidgets()
  const savedHeight = getWidgetHeight(widgetId)
  const [liveHeight, setLiveHeight] = useState<number | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const liveHeightRef = useRef<number | null>(null)

  const clampHeight = useMemo(() => {
    return (height: number) => Math.max(minHeight, Math.min(maxHeight, Math.round(height)))
  }, [maxHeight, minHeight])

  const resolvedHeight = disabled ? null : liveHeight ?? savedHeight ?? null

  useEffect(() => {
    liveHeightRef.current = liveHeight
  }, [liveHeight])

  useEffect(() => {
    if (!disabled && !isResizing && liveHeight !== null && savedHeight === liveHeight) {
      setLiveHeight(null)
    }
  }, [disabled, isResizing, liveHeight, savedHeight])

  useEffect(() => {
    if (!isResizing || disabled) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }

      const nextHeight = clampHeight(dragState.startHeight + (event.clientY - dragState.startY))
      liveHeightRef.current = nextHeight
      setLiveHeight(nextHeight)
    }

    const finishResize = () => {
      const nextHeight = liveHeightRef.current
      dragStateRef.current = null
      setIsResizing(false)

      if (nextHeight !== null) {
        setWidgetHeight(widgetId, nextHeight)
      }
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
    }
  }, [clampHeight, disabled, isResizing, setWidgetHeight, widgetId])

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const measuredHeight = bodyRef.current?.offsetHeight ?? savedHeight ?? minHeight
    const startHeight = clampHeight(measuredHeight)
    dragStateRef.current = {
      startY: event.clientY,
      startHeight
    }
    liveHeightRef.current = startHeight
    setLiveHeight(startHeight)
    setIsResizing(true)
  }

  const handleReset = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = null
    liveHeightRef.current = null
    setIsResizing(false)
    setLiveHeight(null)
    clearWidgetHeight(widgetId)
  }

  return (
    <div className="relative" data-resizing={isResizing ? 'true' : 'false'}>
      <div
        ref={bodyRef}
        className={className}
        style={
          resolvedHeight !== null
            ? {
                height: `${resolvedHeight}px`,
                maxHeight: `${resolvedHeight}px`
              }
            : undefined
        }
      >
        {children}
      </div>

      {!disabled && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-5 items-end justify-center transition-opacity',
            isResizing ? 'opacity-100' : 'opacity-0 group-hover/widget:opacity-100'
          )}
        >
          <button
            type="button"
            className="pointer-events-auto mb-1 flex h-3 w-16 cursor-row-resize touch-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            onPointerDown={handlePointerDown}
            onDoubleClick={handleReset}
            title="Drag to resize. Double-click to reset."
            aria-label="Resize widget"
          >
            <span className="h-1 w-8 rounded-full bg-current/70" />
          </button>
        </div>
      )}
    </div>
  )
}
