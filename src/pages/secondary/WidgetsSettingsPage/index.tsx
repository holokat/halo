import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { AVAILABLE_WIDGETS, useWidgets, TWidgetId, TTrendingNotesHeight, TBitcoinTickerAlignment, TBitcoinTickerTextSize } from '@/providers/WidgetsProvider'
import { useWidgetSidebarTitle } from '@/providers/WidgetSidebarTitleProvider'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { isWebsocketUrl, normalizeUrl, simplifyUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { FormEvent, forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, GripVertical, Plus, X } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import IconPickerDialog from '@/components/IconPickerDialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableWidgetCard({
  id,
  enabled,
  onToggle,
  trendingNotesHeight,
  onTrendingNotesHeightChange,
  bitcoinTickerAlignment,
  onBitcoinTickerAlignmentChange,
  bitcoinTickerTextSize,
  onBitcoinTickerTextSizeChange,
  bitcoinTickerShowBlockHeight,
  onBitcoinTickerShowBlockHeightChange,
  bitcoinTickerShowSatsMode,
  onBitcoinTickerShowSatsModeChange,
  newsRelays,
  newsHashtags,
  onAddNewsRelay,
  onRemoveNewsRelay,
  onAddNewsHashtag,
  onRemoveNewsHashtag
}: {
  id: TWidgetId
  enabled: boolean
  onToggle: () => void
  trendingNotesHeight?: TTrendingNotesHeight
  onTrendingNotesHeightChange?: (height: TTrendingNotesHeight) => void
  bitcoinTickerAlignment?: TBitcoinTickerAlignment
  onBitcoinTickerAlignmentChange?: (alignment: TBitcoinTickerAlignment) => void
  bitcoinTickerTextSize?: TBitcoinTickerTextSize
  onBitcoinTickerTextSizeChange?: (size: TBitcoinTickerTextSize) => void
  bitcoinTickerShowBlockHeight?: boolean
  onBitcoinTickerShowBlockHeightChange?: (show: boolean) => void
  bitcoinTickerShowSatsMode?: boolean
  onBitcoinTickerShowSatsModeChange?: (show: boolean) => void
  newsRelays?: string[]
  newsHashtags?: string[]
  onAddNewsRelay?: (relay: string) => void
  onRemoveNewsRelay?: (relay: string) => void
  onAddNewsHashtag?: (hashtag: string) => void
  onRemoveNewsHashtag?: (hashtag: string) => void
}) {
  const { t } = useTranslation()
  const widget = AVAILABLE_WIDGETS.find((w) => w.id === id)
  const [newsRelayInput, setNewsRelayInput] = useState('')
  const [newsRelayError, setNewsRelayError] = useState<string | null>(null)
  const [newsHashtagInput, setNewsHashtagInput] = useState('')
  const [newsHashtagError, setNewsHashtagError] = useState<string | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  if (!widget) return null

  const showHeightSettings = id === 'trending-notes' && enabled
  const showBitcoinSettings = id === 'bitcoin-ticker' && enabled
  const showNewsSettings = id === 'news' && enabled

  const handleAddNewsRelay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedRelay = normalizeUrl(newsRelayInput)
    if (!normalizedRelay || !isWebsocketUrl(normalizedRelay)) {
      setNewsRelayError(
        t('Enter a valid relay URL like wss://news.utxo.one/', {
          defaultValue: 'Enter a valid relay URL like wss://news.utxo.one/'
        })
      )
      return
    }

    if (newsRelays?.includes(normalizedRelay)) {
      setNewsRelayError(
        t('Relay already added', {
          defaultValue: 'Relay already added'
        })
      )
      return
    }

    onAddNewsRelay?.(normalizedRelay)
    setNewsRelayInput('')
    setNewsRelayError(null)
  }

  const handleAddNewsHashtag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedHashtag = normalizeWidgetHashtag(newsHashtagInput)
    if (!normalizedHashtag) {
      setNewsHashtagError(
        t('Enter a hashtag like bitcoin or #bitcoin', {
          defaultValue: 'Enter a hashtag like bitcoin or #bitcoin'
        })
      )
      return
    }

    if (newsHashtags?.includes(normalizedHashtag)) {
      setNewsHashtagError(
        t('Hashtag already added', {
          defaultValue: 'Hashtag already added'
        })
      )
      return
    }

    onAddNewsHashtag?.(normalizedHashtag)
    setNewsHashtagInput('')
    setNewsHashtagError(null)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative overflow-hidden rounded-xl border-2 transition-all duration-200 group touch-none',
        enabled
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing py-1"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
            enabled
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
          )}
          onClick={onToggle}
        >
          {widget.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-base">{t(widget.name)}</h3>
            {enabled && (
              <div className="flex-shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Check className="h-3 w-3" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t(widget.description)}</p>
        </div>

        {/* Switch */}
        <div className="flex-shrink-0">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Widget-specific settings */}
      {showHeightSettings && trendingNotesHeight && onTrendingNotesHeightChange && (
        <div className="px-4 pb-4 pt-2 border-t border-border/50">
          <Label className="text-sm font-medium mb-2 block">Widget Height</Label>
          <RadioGroup
            value={trendingNotesHeight}
            onValueChange={onTrendingNotesHeightChange}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="short" id={`${id}-short`} />
              <Label htmlFor={`${id}-short`} className="cursor-pointer font-normal">
                Short (220px)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="medium" id={`${id}-medium`} />
              <Label htmlFor={`${id}-medium`} className="cursor-pointer font-normal">
                Medium (320px)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="tall" id={`${id}-tall`} />
              <Label htmlFor={`${id}-tall`} className="cursor-pointer font-normal">
                Tall (480px)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="remaining" id={`${id}-remaining`} />
              <Label htmlFor={`${id}-remaining`} className="cursor-pointer font-normal">
                Remaining space
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground mt-3">
            {t('Powered by nostr.band API. Issues may be due to API availability.')}
          </p>
        </div>
      )}

      {showBitcoinSettings && bitcoinTickerAlignment && onBitcoinTickerAlignmentChange && bitcoinTickerTextSize && onBitcoinTickerTextSizeChange && bitcoinTickerShowBlockHeight !== undefined && onBitcoinTickerShowBlockHeightChange && bitcoinTickerShowSatsMode !== undefined && onBitcoinTickerShowSatsModeChange && (
        <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Text Alignment</Label>
              <RadioGroup
                value={bitcoinTickerAlignment}
                onValueChange={onBitcoinTickerAlignmentChange}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="left" id={`${id}-align-left`} />
                  <Label htmlFor={`${id}-align-left`} className="cursor-pointer font-normal">
                    Left
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="center" id={`${id}-align-center`} />
                  <Label htmlFor={`${id}-align-center`} className="cursor-pointer font-normal">
                    Center
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Text Size</Label>
              <RadioGroup
                value={bitcoinTickerTextSize}
                onValueChange={onBitcoinTickerTextSizeChange}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="large" id={`${id}-size-large`} />
                  <Label htmlFor={`${id}-size-large`} className="cursor-pointer font-normal">
                    Large
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="small" id={`${id}-size-small`} />
                  <Label htmlFor={`${id}-size-small`} className="cursor-pointer font-normal">
                    Small
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Sats per Dollar</Label>
              <p className="text-xs text-muted-foreground mt-1">Display sats per dollar instead of USD price</p>
            </div>
            <Switch
              checked={bitcoinTickerShowSatsMode}
              onCheckedChange={onBitcoinTickerShowSatsModeChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Block Height</Label>
              <p className="text-xs text-muted-foreground mt-1">Display current Bitcoin block height</p>
            </div>
            <Switch
              checked={bitcoinTickerShowBlockHeight}
              onCheckedChange={onBitcoinTickerShowBlockHeightChange}
            />
          </div>
        </div>
      )}

      {showNewsSettings &&
        newsRelays &&
        newsHashtags &&
        onAddNewsRelay &&
        onRemoveNewsRelay &&
        onAddNewsHashtag &&
        onRemoveNewsHashtag && (
        <div className="space-y-3 border-t border-border/50 px-4 pb-4 pt-2">
          <div>
            <Label className="mb-2 block text-sm font-medium">
              {t('News Relays', { defaultValue: 'News Relays' })}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('Add or remove relays to customize which news sources appear in the widget.', {
                defaultValue:
                  'Add or remove relays to customize which news sources appear in the widget.'
              })}
            </p>
          </div>

          <form className="flex items-center gap-2" onSubmit={handleAddNewsRelay}>
            <Input
              value={newsRelayInput}
              onChange={(event) => {
                setNewsRelayInput(event.target.value)
                if (newsRelayError) {
                  setNewsRelayError(null)
                }
              }}
              placeholder="wss://news.utxo.one/"
              aria-label={t('Add news relay', { defaultValue: 'Add news relay' })}
              className="h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {newsRelayError ? <p className="text-xs text-destructive">{newsRelayError}</p> : null}

          {newsRelays.length > 0 ? (
            <div className="space-y-2">
              {newsRelays.map((relay) => (
                <div
                  key={relay}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background/60 px-3 py-2"
                >
                  <span className="truncate text-sm">{simplifyUrl(relay)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onRemoveNewsRelay(relay)}
                    title={t('Remove relay', { defaultValue: 'Remove relay' })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {t('No news relays configured. Add one above to populate the widget.', {
                defaultValue: 'No news relays configured. Add one above to populate the widget.'
              })}
            </div>
          )}

          <div className="pt-2">
            <Label className="mb-2 block text-sm font-medium">
              {t('News Hashtags', { defaultValue: 'News Hashtags' })}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('Add hashtags to also pull matching notes into the widget from your selected relays.', {
                defaultValue:
                  'Add hashtags to also pull matching notes into the widget from your selected relays.'
              })}
            </p>
          </div>

          <form className="flex items-center gap-2" onSubmit={handleAddNewsHashtag}>
            <Input
              value={newsHashtagInput}
              onChange={(event) => {
                setNewsHashtagInput(event.target.value)
                if (newsHashtagError) {
                  setNewsHashtagError(null)
                }
              }}
              placeholder="#bitcoin"
              aria-label={t('Add news hashtag', { defaultValue: 'Add news hashtag' })}
              className="h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {newsHashtagError ? <p className="text-xs text-destructive">{newsHashtagError}</p> : null}

          {newsHashtags.length > 0 ? (
            <div className="space-y-2">
              {newsHashtags.map((hashtag) => (
                <div
                  key={hashtag}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background/60 px-3 py-2"
                >
                  <span className="truncate text-sm">#{hashtag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onRemoveNewsHashtag(hashtag)}
                    title={t('Remove hashtag', { defaultValue: 'Remove hashtag' })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {t('No news hashtags configured. Add one above to include matching notes too.', {
                defaultValue: 'No news hashtags configured. Add one above to include matching notes too.'
              })}
            </div>
          )}
        </div>
      )}

      {/* Active indicator bar */}
      {enabled && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
      )}
    </div>
  )
}

const WidgetsSettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const {
    enabledWidgets,
    isWidgetEnabled,
    toggleWidget,
    reorderWidgets,
    hideWidgetTitles,
    setHideWidgetTitles,
    trendingNotesHeight,
    setTrendingNotesHeight,
    bitcoinTickerAlignment,
    setBitcoinTickerAlignment,
    bitcoinTickerTextSize,
    setBitcoinTickerTextSize,
    bitcoinTickerShowBlockHeight,
    setBitcoinTickerShowBlockHeight,
    bitcoinTickerShowSatsMode,
    setBitcoinTickerShowSatsMode,
    newsWidgetRelays,
    newsWidgetHashtags,
    addNewsWidgetRelay,
    removeNewsWidgetRelay,
    addNewsWidgetHashtag,
    removeNewsWidgetHashtag
  } = useWidgets()
  const { widgetSidebarTitle, setWidgetSidebarTitle, widgetSidebarIcon, setWidgetSidebarIcon } = useWidgetSidebarTitle()
  const [activeId, setActiveId] = useState<TWidgetId | null>(null)

  // Get the icon component if one is selected
  const SelectedIconComponent = widgetSidebarIcon ? (LucideIcons as any)[widgetSidebarIcon] : null

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // Create ordered list: enabled widgets first (in their order), then disabled widgets
  const orderedWidgets = [
    ...enabledWidgets,
    ...AVAILABLE_WIDGETS.filter((w) => !enabledWidgets.includes(w.id)).map((w) => w.id)
  ]

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as TWidgetId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedWidgets.indexOf(active.id as TWidgetId)
      const newIndex = orderedWidgets.indexOf(over.id as TWidgetId)
      const newOrder = arrayMove(orderedWidgets, oldIndex, newIndex)

      // Only update enabled widgets order
      const newEnabledOrder = newOrder.filter((id) => enabledWidgets.includes(id))
      reorderWidgets(newEnabledOrder)
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const activeWidget = activeId ? AVAILABLE_WIDGETS.find((w) => w.id === activeId) : null

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Widgets')}>
      <div className="px-4 py-3 text-sm text-muted-foreground border-b">
        {t('Customize which widgets appear in your sidebar. Drag widgets to reorder them.')}
      </div>

      {/* Custom Sidebar Title & Icon Settings */}
      <div className="px-4 pt-4 pb-3 border-b space-y-4">
        <div>
          <Label htmlFor="sidebar-title" className="text-sm font-medium mb-2 block">
            {t('Sidebar Title')}
          </Label>
          <Input
            id="sidebar-title"
            value={widgetSidebarTitle}
            onChange={(e) => setWidgetSidebarTitle(e.target.value)}
            placeholder="Widgets"
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {t('Customize the title displayed at the top of your widget sidebar')}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">
            {t('Sidebar Icon')}
          </Label>
          <div className="flex items-center gap-2">
            <IconPickerDialog
              selectedIcon={widgetSidebarIcon || undefined}
              onIconSelect={setWidgetSidebarIcon}
            >
              <Button
                variant="outline"
                className={cn(
                  "h-12 w-12 p-0",
                  !widgetSidebarIcon && "border-dashed"
                )}
              >
                {SelectedIconComponent ? (
                  <SelectedIconComponent className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </IconPickerDialog>
            <div className="flex-1">
              <p className="text-sm">
                {widgetSidebarIcon ? (
                  <span className="font-medium">{widgetSidebarIcon}</span>
                ) : (
                  <span className="text-muted-foreground">{t('No icon selected')}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('Choose an icon to display next to your sidebar title')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">
              {t('Hide Widget Titles')}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t('Remove titles from all widgets for a cleaner look')}
            </p>
          </div>
          <Switch
            checked={hideWidgetTitles}
            onCheckedChange={setHideWidgetTitles}
          />
        </div>
      </div>

      <div className="p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={orderedWidgets} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {orderedWidgets.map((widgetId) => (
                <SortableWidgetCard
                  key={widgetId}
                  id={widgetId}
                  enabled={isWidgetEnabled(widgetId)}
                  onToggle={() => toggleWidget(widgetId)}
                  trendingNotesHeight={trendingNotesHeight}
                  onTrendingNotesHeightChange={setTrendingNotesHeight}
                  bitcoinTickerAlignment={bitcoinTickerAlignment}
                  onBitcoinTickerAlignmentChange={setBitcoinTickerAlignment}
                  bitcoinTickerTextSize={bitcoinTickerTextSize}
                  onBitcoinTickerTextSizeChange={setBitcoinTickerTextSize}
                  bitcoinTickerShowBlockHeight={bitcoinTickerShowBlockHeight}
                  onBitcoinTickerShowBlockHeightChange={setBitcoinTickerShowBlockHeight}
                  bitcoinTickerShowSatsMode={bitcoinTickerShowSatsMode}
                  onBitcoinTickerShowSatsModeChange={setBitcoinTickerShowSatsMode}
                  newsRelays={newsWidgetRelays}
                  newsHashtags={newsWidgetHashtags}
                  onAddNewsRelay={addNewsWidgetRelay}
                  onRemoveNewsRelay={removeNewsWidgetRelay}
                  onAddNewsHashtag={addNewsWidgetHashtag}
                  onRemoveNewsHashtag={removeNewsWidgetHashtag}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeWidget ? (
              <div className="rounded-xl border-2 border-primary bg-primary/10 shadow-2xl opacity-90 p-4 flex items-start gap-3">
                <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  {activeWidget.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base">{t(activeWidget.name)}</h3>
                  <p className="text-sm text-muted-foreground">{t(activeWidget.description)}</p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </SecondaryPageLayout>
  )
})
WidgetsSettingsPage.displayName = 'WidgetsSettingsPage'
export default WidgetsSettingsPage

function normalizeWidgetHashtag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase()
}
