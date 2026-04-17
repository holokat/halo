import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import GifIcon from '@/components/icons/GifIcon'
import Tabs from '@/components/Tabs'
import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import gifService, { type GifData } from '@/services/gif.service'
import type { ImageAttachment } from '@/services/post-editor-cache.service'
import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface GifPickerProps {
  onGifSelect: (attachment: ImageAttachment) => void
  children?: React.ReactNode
}

type GifPickerMode = 'trending' | 'search'

function GifPickerContent({
  onGifClick,
  isSmallScreen,
  onClose
}: {
  onGifClick: (gif: GifData, onProgress: (progress: number) => void) => Promise<void>
  isSmallScreen: boolean
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const [searchQuery, setSearchQuery] = useState('')
  const [mode, setMode] = useState<GifPickerMode>('trending')
  const [gifs, setGifs] = useState<GifData[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedGifId, setSelectedGifId] = useState<string | null>(null)
  const [selectionProgress, setSelectionProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const searchTimeoutRef = useRef<number>()
  const offsetRef = useRef(0)

  const gridCols = isSmallScreen ? 2 : 3
  const gifsPerPage = isSmallScreen ? 16 : 24
  const canInteract = !selectedGifId

  useEffect(() => {
    void reloadGifs('')

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const reloadGifs = async (query: string) => {
    setIsLoading(true)
    setErrorMessage('')
    offsetRef.current = 0

    try {
      const result = query.trim()
        ? await gifService.searchGifs(query, gifsPerPage, 0, pubkey ?? undefined)
        : await gifService.fetchRecentGifs(gifsPerPage, 0, pubkey ?? undefined)

      setGifs(result.gifs)
      setHasMore(result.hasMore)
      offsetRef.current = result.gifs.length
    } catch (error) {
      console.error('Error loading Klipy GIFs:', error)
      setGifs([])
      setHasMore(false)
      setErrorMessage(error instanceof Error ? error.message : t("Couldn't load GIFs right now."))
    } finally {
      setIsLoading(false)
    }
  }

  const loadMoreGifs = async () => {
    if (isLoadingMore || !canInteract) return

    setIsLoadingMore(true)
    setErrorMessage('')

    try {
      const result =
        mode === 'search' && searchQuery.trim()
          ? await gifService.searchGifs(
              searchQuery,
              gifsPerPage,
              offsetRef.current,
              pubkey ?? undefined
            )
          : await gifService.fetchRecentGifs(gifsPerPage, offsetRef.current, pubkey ?? undefined)

      setGifs((prev) => [...prev, ...result.gifs])
      setHasMore(result.hasMore)
      offsetRef.current += result.gifs.length
    } catch (error) {
      console.error('Error loading more Klipy GIFs:', error)
      setErrorMessage(
        error instanceof Error ? error.message : t("Couldn't load more GIFs right now.")
      )
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setMode(query.trim() ? 'search' : 'trending')

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      void reloadGifs(query)
    }, 300)
  }

  const handleGifClick = async (gif: GifData) => {
    if (!canInteract) return

    setSelectedGifId(gif.id)
    setSelectionProgress(0)
    setErrorMessage('')

    try {
      await onGifClick(gif, setSelectionProgress)
    } catch (error) {
      console.error('Error adding Klipy GIF:', error)
      setErrorMessage(
        error instanceof Error ? error.message : t("Couldn't add that GIF right now.")
      )
    } finally {
      setSelectedGifId(null)
      setSelectionProgress(0)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setMode('trending')
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }
    void reloadGifs('')
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('Search GIFs...')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-9"
            autoFocus={!isSmallScreen}
            disabled={!canInteract}
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-9"
              onClick={clearSearch}
              disabled={!canInteract}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
            disabled={!canInteract}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs
        tabs={[
          { value: 'trending', label: t('Trending right now') },
          { value: 'search', label: t('Search results') }
        ]}
        value={mode}
        onTabChange={(tab) => {
          if (tab === 'trending') {
            clearSearch()
          }
        }}
        threshold={0}
      />

      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {selectedGifId && (
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t('Adding GIF...')} {selectionProgress > 0 ? `${selectionProgress}%` : ''}
        </div>
      )}

      <div
        className={cn('overflow-y-auto pr-2', isSmallScreen ? 'h-80' : 'h-96')}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--border)) transparent',
          overscrollBehavior: 'contain'
        }}
        onWheel={(e) => {
          e.stopPropagation()
        }}
      >
        {isLoading ? (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: isSmallScreen ? '20rem' : '24rem' }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : gifs.length > 0 ? (
          <div className="space-y-3">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`
              }}
            >
              {gifs.map((gif, index) => {
                const isSelected = selectedGifId === gif.id

                return (
                  <button
                    key={`${gif.id}-${index}`}
                    onClick={() => void handleGifClick(gif)}
                    className="group relative aspect-[1.08] overflow-hidden rounded-xl border border-border bg-muted transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-wait"
                    title={gif.alt}
                    disabled={!canInteract}
                  >
                    <KlipyGifTile gif={gif} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-2 text-left">
                      <div className="truncate text-xs font-semibold text-white">
                        {gif.title || t('GIF')}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center pb-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadMoreGifs()}
                  disabled={isLoadingMore || !canInteract}
                  className="w-full"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('Loading...')}
                    </>
                  ) : (
                    t('Load More')
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
            style={{ minHeight: isSmallScreen ? '20rem' : '24rem' }}
          >
            <GifIcon className="h-8 w-8 opacity-60" />
            <p>{searchQuery ? t('No GIFs found') : t('No recent GIFs')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function KlipyGifTile({ gif }: { gif: GifData }) {
  const [videoFailed, setVideoFailed] = useState(false)
  const previewUrl = gif.previewUrl || gif.url
  const animatedUrl = gif.animatedPreviewUrl || gif.mp4Url
  const canShowVideo = animatedUrl && !videoFailed && animatedUrl.endsWith('.mp4')

  if (canShowVideo) {
    return (
      <video
        src={animatedUrl}
        poster={previewUrl}
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        onError={() => setVideoFailed(true)}
      />
    )
  }

  return (
    <img src={previewUrl} alt={gif.alt} className="h-full w-full object-cover" loading="lazy" />
  )
}

export default function GifPicker({ onGifSelect, children }: GifPickerProps) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const [open, setOpen] = useState(false)

  const handleGifClick = async (gif: GifData, onProgress: (progress: number) => void) => {
    const attachment = await gifService.createAttachmentFromGif(gif, { onProgress })
    onGifSelect(attachment)
    setOpen(false)
    void gifService.registerShare(gif)
  }

  const handleClose = () => {
    setOpen(false)
  }

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {children || (
            <Button variant="ghost" size="icon" title={t('Add GIF')}>
              <GifIcon />
            </Button>
          )}
        </DrawerTrigger>
        <DrawerContent>
          <GifPickerContent
            onGifClick={handleGifClick}
            isSmallScreen={isSmallScreen}
            onClose={handleClose}
          />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon" title={t('Add GIF')}>
            <GifIcon />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start" side="top">
        <GifPickerContent
          onGifClick={handleGifClick}
          isSmallScreen={isSmallScreen}
          onClose={handleClose}
        />
      </PopoverContent>
    </Popover>
  )
}
