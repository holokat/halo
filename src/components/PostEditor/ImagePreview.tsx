import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { ImageAttachment } from '@/services/post-editor-cache.service'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Helper function to detect if a URL is a video
function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const extension = urlObj.pathname.split('.').pop()?.toLowerCase()
    return ['mp4', 'webm', 'ogg', 'mov'].includes(extension || '')
  } catch {
    return false
  }
}

// Helper function to detect if a URL is audio
function isAudioUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const extension = urlObj.pathname.split('.').pop()?.toLowerCase()
    return ['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus', 'wma'].includes(extension || '')
  } catch {
    return false
  }
}

export default function ImagePreview({
  images,
  onRemove,
  mode = 'default'
}: {
  images: ImageAttachment[]
  onRemove: (index: number) => void
  mode?: 'default' | 'mobile'
}) {
  const { t } = useTranslation()
  const isMobileMode = mode === 'mobile'

  if (images.length === 0) return null

  const mobileItemWidthClass =
    images.length > 1 ? 'w-[44vw] min-w-[150px] max-w-[220px]' : 'w-[min(72vw,260px)] min-w-[180px]'

  const imageItems = images.map((image, index) => {
    const isVideo = isVideoUrl(image.url)
    const isAudio = isAudioUrl(image.url)

    if (isMobileMode) {
      return (
        <div
          key={`${image.url}-${index}`}
          className={`relative shrink-0 overflow-hidden border bg-muted/40 ${mobileItemWidthClass}`}
          style={{ borderRadius: 'var(--media-radius, 22px)' }}
        >
          <div className="aspect-[3/4] w-full">
            {isVideo ? (
              <video
                src={image.url}
                poster={image.previewUrl}
                className="h-full w-full object-cover"
                muted
                loop={image.gifLoop}
                autoPlay={image.gifLoop}
                playsInline
                preload="metadata"
              />
            ) : isAudio ? (
              <div className="flex h-full w-full items-center justify-center bg-muted p-3 text-center text-xs text-muted-foreground">
                🎵 {t('Audio')}
              </div>
            ) : (
              <img
                src={image.url}
                alt={image.alt || t('Uploaded image')}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2 h-9 w-9 rounded-full bg-black/75 text-white hover:bg-black/85"
            onClick={() => onRemove(index)}
            title={isVideo ? t('Remove video') : isAudio ? t('Remove audio') : t('Remove image')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )
    }

    return (
      <div
        key={`${image.url}-${index}`}
        className="group relative shrink-0 overflow-hidden border bg-muted/40"
        style={{ width: '120px', height: '120px', borderRadius: 'var(--media-radius, 18px)' }}
      >
        {isVideo ? (
          <video
            src={image.url}
            poster={image.previewUrl}
            className="h-full w-full object-cover"
            muted
            loop={image.gifLoop}
            autoPlay={image.gifLoop}
            playsInline
            preload="metadata"
          />
        ) : isAudio ? (
          <div className="flex h-full w-full items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">
            🎵 {t('Audio')}
          </div>
        ) : (
          <img
            src={image.url}
            alt={image.alt || t('Uploaded image')}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={() => onRemove(index)}
            title={isVideo ? t('Remove video') : isAudio ? t('Remove audio') : t('Remove image')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {image.alt && (
          <div className="absolute bottom-0 left-0 right-0 truncate bg-black/70 p-1 text-xs text-white">
            {image.alt}
          </div>
        )}
      </div>
    )
  })

  return (
    <>
      <div className="space-y-2">
        {isMobileMode ? (
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2">{imageItems}</div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">{imageItems}</div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>
    </>
  )
}
