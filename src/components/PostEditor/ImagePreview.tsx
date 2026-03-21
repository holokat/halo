import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { ImageAttachment } from '@/services/post-editor-cache.service'
import { Info, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AudioPlayer from '../AudioPlayer'

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
  onUpdateAlt,
  mode = 'default',
  hideAltControls = false
}: {
  images: ImageAttachment[]
  onRemove: (index: number) => void
  onUpdateAlt: (index: number, alt: string) => void
  mode?: 'default' | 'mobile'
  hideAltControls?: boolean
}) {
  const { t } = useTranslation()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [altText, setAltText] = useState('')
  const isMobileMode = mode === 'mobile'

  const handleOpenAltDialog = (index: number) => {
    if (hideAltControls) return
    setEditingIndex(index)
    setAltText(images[index]?.alt || '')
  }

  const handleSaveAlt = () => {
    if (editingIndex !== null) {
      onUpdateAlt(editingIndex, altText)
      setEditingIndex(null)
      setAltText('')
    }
  }

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
                className="h-full w-full object-cover"
                muted
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
            className="h-full w-full object-cover"
            muted
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
          {!hideAltControls && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => handleOpenAltDialog(index)}
              title={t('Add alt text')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
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
        {!hideAltControls && image.alt && (
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

      <Dialog
        open={!hideAltControls && editingIndex !== null}
        onOpenChange={() => setEditingIndex(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Add alt text')}</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="text-sm">
                {t(
                  'Alt text helps people who use screen readers by describing what is in the image. Good descriptions are concise and provide important context.'
                )}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingIndex !== null && images[editingIndex] && (
              <div
                className="overflow-hidden border bg-muted/40"
                style={{ borderRadius: 'var(--media-radius, 18px)' }}
              >
                {isVideoUrl(images[editingIndex].url) ? (
                  <video
                    src={images[editingIndex].url}
                    controls
                    className="w-full h-auto max-h-48 object-contain"
                  />
                ) : isAudioUrl(images[editingIndex].url) ? (
                  <div className="w-full p-8 flex items-center justify-center bg-muted text-muted-foreground">
                    <AudioPlayer src={images[editingIndex].url} className="w-full" />
                  </div>
                ) : (
                  <img
                    src={images[editingIndex].url}
                    alt={images[editingIndex].alt || t('Preview')}
                    className="w-full h-auto max-h-48 object-contain"
                  />
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="alt-text">{t('Description')}</Label>
              <Input
                id="alt-text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder={t('Describe this image...')}
                maxLength={200}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSaveAlt()
                  }
                }}
              />
              <div className="text-xs text-muted-foreground text-right">{altText.length}/200</div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditingIndex(null)
                setAltText('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type="button" onClick={handleSaveAlt}>
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
