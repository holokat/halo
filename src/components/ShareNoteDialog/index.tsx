import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { useFetchProfile } from '@/hooks'
import { extractMediaUrls, getImetaInfosFromEvent, getNoteBech32Id } from '@/lib/event'
import { toNlink } from '@/lib/link'
import { formatPubkey, generateImageByPubkey } from '@/lib/pubkey'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import dayjs from 'dayjs'
import { Copy, Loader2, Mail, RefreshCcw, X } from 'lucide-react'
import { Event } from 'nostr-tools'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const SHARE_GRADIENTS = [
  ['#5668d9', '#d170d9'],
  ['#ff7a59', '#8f5bff'],
  ['#00a3ff', '#7c4dff'],
  ['#17b26a', '#4f46e5'],
  ['#ff8a00', '#e84ac2'],
  ['#0ea5e9', '#f97316']
] as const

const CARD_WIDTH = 1080

const OUTER_PADDING_X = 72
const OUTER_PADDING_Y = 56
const CONTENT_X = OUTER_PADDING_X
const CONTENT_Y = OUTER_PADDING_Y
const CONTENT_WIDTH = CARD_WIDTH - OUTER_PADDING_X * 2

export default function ShareNoteDialog({
  event,
  open,
  onOpenChange
}: {
  event: Event
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { profile } = useFetchProfile(event.pubkey)
  const fallbackAvatar = useMemo(() => generateImageByPubkey(event.pubkey), [event.pubkey])
  const [avatarDataUrl, setAvatarDataUrl] = useState(fallbackAvatar)
  const [noteImageDataUrl, setNoteImageDataUrl] = useState<string | null>(null)
  const [gradientIndex, setGradientIndex] = useState(() =>
    Math.floor(Math.random() * SHARE_GRADIENTS.length)
  )
  const [isCopyingImage, setIsCopyingImage] = useState(false)
  const noteImage = useMemo(() => {
    const firstImetaImage = getImetaInfosFromEvent(event).find(
      (image) => !image.mimeType || image.mimeType.startsWith('image/')
    )
    if (firstImetaImage) {
      return firstImetaImage
    }

    const firstImageUrl = extractMediaUrls(event).images[0]
    if (!firstImageUrl) {
      return null
    }

    return { url: firstImageUrl }
  }, [event])

  useEffect(() => {
    let cancelled = false
    const avatarUrl = profile?.avatar

    if (!avatarUrl) {
      setAvatarDataUrl(fallbackAvatar)
      return
    }

    if (avatarUrl.startsWith('data:')) {
      setAvatarDataUrl(avatarUrl)
      return
    }

    const resolveAvatar = async () => {
      try {
        const response = await fetch(avatarUrl)
        if (!response.ok) {
          throw new Error(`Avatar request failed with ${response.status}`)
        }

        const avatarBlob = await response.blob()
        const nextAvatarDataUrl = await blobToDataUrl(avatarBlob)
        if (!cancelled) {
          setAvatarDataUrl(nextAvatarDataUrl)
        }
      } catch {
        if (!cancelled) {
          setAvatarDataUrl(fallbackAvatar)
        }
      }
    }

    void resolveAvatar()

    return () => {
      cancelled = true
    }
  }, [fallbackAvatar, profile?.avatar])

  useEffect(() => {
    let cancelled = false
    const imageUrl = noteImage?.url

    if (!imageUrl) {
      setNoteImageDataUrl(null)
      return
    }

    if (imageUrl.startsWith('data:')) {
      setNoteImageDataUrl(imageUrl)
      return
    }

    const resolveNoteImage = async () => {
      try {
        const nextImageDataUrl = await resolveImageToDataUrl(imageUrl)
        if (!cancelled) {
          setNoteImageDataUrl(nextImageDataUrl)
        }
      } catch {
        if (!cancelled) {
          setNoteImageDataUrl(null)
        }
      }
    }

    void resolveNoteImage()

    return () => {
      cancelled = true
    }
  }, [noteImage?.url])

  useEffect(() => {
    if (!open) return
    setGradientIndex(Math.floor(Math.random() * SHARE_GRADIENTS.length))
  }, [event.id, open])

  const shareUrl = useMemo(() => toNlink(getNoteBech32Id(event)), [event])
  const noteText = useMemo(() => getShareableNoteText(event.content), [event.content])
  const displayName = profile?.username || formatPubkey(event.pubkey)
  const handle = useMemo(() => {
    const candidate =
      profile?.original_username?.trim() || profile?.username || formatPubkey(event.pubkey)
    return candidate.replace(/^@+/, '')
  }, [event.pubkey, profile?.original_username, profile?.username])
  const timestampLabel = useMemo(
    () => formatShareTimestamp(event.created_at, t),
    [event.created_at, t]
  )
  const gradient = SHARE_GRADIENTS[gradientIndex]
  const shareCard = useMemo(
    () =>
      buildShareCardSvg({
        avatarDataUrl,
        displayName,
        handle,
        noteText,
        noteImageDataUrl,
        noteImageDimensions: noteImage?.dim,
        timestampLabel,
        gradient
      }),
    [
      avatarDataUrl,
      displayName,
      gradient,
      handle,
      noteImage?.dim,
      noteImageDataUrl,
      noteText,
      timestampLabel
    ]
  )
  const shareCardPreview = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shareCard.svg)}`,
    [shareCard.svg]
  )

  const shareTargets = useMemo<
    { id: string; label: string; href: string; icon: ReactNode; external?: boolean }[]
  >(
    () => [
      {
        id: 'x',
        label: t('Share to X', { defaultValue: 'Share to X' }),
        href: `https://x.com/intent/tweet?text=${encodeURIComponent(noteText)}&url=${encodeURIComponent(shareUrl)}`,
        icon: <span className="text-sm font-semibold">X</span>
      },
      {
        id: 'linkedin',
        label: t('Share to LinkedIn', { defaultValue: 'Share to LinkedIn' }),
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
        icon: <span className="text-sm font-semibold">in</span>
      },
      {
        id: 'facebook',
        label: t('Share to Facebook', { defaultValue: 'Share to Facebook' }),
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        icon: <span className="text-sm font-semibold">f</span>
      },
      {
        id: 'email',
        label: t('Share by email', { defaultValue: 'Share by email' }),
        href: `mailto:?subject=${encodeURIComponent(
          t('Shared note from Halo', { defaultValue: 'Shared note from Halo' })
        )}&body=${encodeURIComponent(`${noteText}\n\n${shareUrl}`)}`,
        icon: <Mail className="size-4" />,
        external: false
      }
    ],
    [noteText, shareUrl, t]
  )

  const handleNewGradient = () => {
    setGradientIndex((currentIndex) => getNextGradientIndex(currentIndex))
  }

  const handleCopyImage = async () => {
    setIsCopyingImage(true)
    try {
      const imageBlob = await renderShareCardToPngBlob(shareCard)
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageBlob
          })
        ])
        toast.success(t('Image copied to clipboard', { defaultValue: 'Image copied to clipboard' }))
      } else {
        downloadBlob(imageBlob, `halo-note-${event.id.slice(0, 8)}.png`)
        toast.success(
          t('Image downloaded instead', {
            defaultValue: 'Image downloaded instead'
          })
        )
      }
    } catch (error) {
      console.error('Failed to copy share image:', error)
      toast.error(t('Failed to copy image', { defaultValue: 'Failed to copy image' }))
    } finally {
      setIsCopyingImage(false)
    }
  }

  const handleShareTargetClick = (href: string, external = true) => {
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }

    window.location.href = href
  }

  const content = (
    <div className="space-y-5">
      <img
        src={shareCardPreview}
        alt={t('Share preview', { defaultValue: 'Share preview' })}
        className="mx-auto block w-full max-w-[640px] rounded-[1.5rem]"
      />

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.08] hover:text-white"
          onClick={handleNewGradient}
        >
          <RefreshCcw />
          {t('New Gradient', { defaultValue: 'New Gradient' })}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.08] hover:text-white"
          onClick={() => void handleCopyImage()}
          disabled={isCopyingImage}
        >
          {isCopyingImage ? <Loader2 className="animate-spin" /> : <Copy />}
          {t('Copy Image', { defaultValue: 'Copy Image' })}
        </Button>
      </div>

      <Separator className="bg-white/10" />

      <div className="space-y-3">
        <div className="text-sm text-white/70">{t('Share to:', { defaultValue: 'Share to:' })}</div>
        <div className="flex flex-wrap gap-3">
          {shareTargets.map((target) => (
            <Button
              key={target.id}
              type="button"
              variant="outline"
              size="icon"
              className="size-12 rounded-2xl border-white/12 bg-white/[0.02] text-white hover:bg-white/[0.08] hover:text-white"
              onClick={() => handleShareTargetClick(target.href, target.external)}
              title={target.label}
              aria-label={target.label}
            >
              {target.icon}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )

  const header = (close: () => void) => (
    <div className="flex items-start justify-between gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">
        {t('Share', { defaultValue: 'Share' })}
      </h2>
      <button
        type="button"
        className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
        onClick={close}
        aria-label={t('Close', { defaultValue: 'Close' })}
      >
        <X className="size-5" />
      </button>
    </div>
  )

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh] border-t border-white/10 bg-[#080809] text-white">
          <div className="overflow-y-auto px-5 pb-5">
            <DrawerTitle className="sr-only">{t('Share', { defaultValue: 'Share' })}</DrawerTitle>
            <div className="space-y-5 pt-1">
              {header(() => onOpenChange(false))}
              {content}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        withoutClose
        className="max-h-[88vh] max-w-[700px] overflow-y-auto border border-white/10 bg-[#080809] p-5 sm:p-6 text-white"
      >
        <DialogTitle className="sr-only">{t('Share', { defaultValue: 'Share' })}</DialogTitle>
        {header(() => onOpenChange(false))}
        {content}
      </DialogContent>
    </Dialog>
  )
}

function getShareableNoteText(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\/\S+$/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatShareTimestamp(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const time = dayjs(timestamp * 1000)
  const now = dayjs()

  const diffDay = now.diff(time, 'day')
  if (diffDay >= 1) {
    return t('n d', { n: diffDay, defaultValue: '{{n}}d' })
  }

  const diffHour = now.diff(time, 'hour')
  if (diffHour >= 1) {
    return t('n h', { n: diffHour, defaultValue: '{{n}}h' })
  }

  const diffMinute = now.diff(time, 'minute')
  if (diffMinute >= 1) {
    return t('n m', { n: diffMinute, defaultValue: '{{n}}m' })
  }

  return t('just now', { defaultValue: 'just now' })
}

function getNextGradientIndex(currentIndex: number) {
  if (SHARE_GRADIENTS.length <= 1) return currentIndex

  let nextIndex = currentIndex
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * SHARE_GRADIENTS.length)
  }
  return nextIndex
}

function buildShareCardSvg({
  avatarDataUrl,
  displayName,
  handle,
  noteText,
  noteImageDataUrl,
  noteImageDimensions,
  timestampLabel,
  gradient
}: {
  avatarDataUrl: string
  displayName: string
  handle: string
  noteText: string
  noteImageDataUrl: string | null
  noteImageDimensions?: { width: number; height: number }
  timestampLabel: string
  gradient: readonly [string, string]
}) {
  const hasText = Boolean(noteText.trim())
  const hasImage = Boolean(noteImageDataUrl)
  const noteLines = hasText ? wrapText(noteText, hasImage ? 42 : 44, hasImage ? 3 : 5) : []
  const safeAvatar = escapeXml(avatarDataUrl)
  const safeDisplayName = escapeXml(displayName)
  const safeHandle = escapeXml(`@${handle}`)
  const safeTimestamp = escapeXml(timestampLabel)
  const safeLines = noteLines.map((line) => escapeXml(line))
  const safeNoteImage = noteImageDataUrl ? escapeXml(noteImageDataUrl) : null
  const [gradientStart, gradientEnd] = gradient
  const avatarCenterX = CONTENT_X + 74
  const avatarCenterY = CONTENT_Y + 74
  const avatarRadius = 36
  const avatarInnerRadius = 33
  const avatarX = avatarCenterX - avatarInnerRadius
  const avatarY = avatarCenterY - avatarInnerRadius
  const displayNameX = CONTENT_X + 128
  const displayNameY = CONTENT_Y + 67
  const handleY = CONTENT_Y + 99
  const timestampX = CONTENT_X + CONTENT_WIDTH - 44
  const timestampY = CONTENT_Y + 71
  const bodyX = CONTENT_X + 44
  const bodyWidth = CONTENT_WIDTH - 88
  const bodyTop = CONTENT_Y + 152
  const lineGap = 54

  const tspans = safeLines
    .map((line, index) => `<tspan x="${bodyX}" dy="${index === 0 ? 0 : lineGap}">${line}</tspan>`)
    .join('')
  const textMarkup = hasText
    ? `<text x="${bodyX}" y="${bodyTop}" fill="#f5f5fa" font-size="26" font-family="Inter, Arial, sans-serif" font-weight="500">${tspans}</text>`
    : ''
  const textHeight = safeLines.length > 0 ? 32 + (safeLines.length - 1) * lineGap : 0
  const imageGap = hasText && hasImage ? 24 : 0
  const imageHeight = hasImage
    ? getShareCardImageHeight({
        dimensions: noteImageDimensions,
        width: bodyWidth,
        hasText
      })
    : 0
  const contentHeight = Math.max(320, 132 + textHeight + imageGap + imageHeight + 34 + 74)
  const footerLineY = CONTENT_Y + contentHeight - 58
  const footerTextY = CONTENT_Y + contentHeight - 22
  const cardHeight = contentHeight
  const cardBottom = CONTENT_Y + cardHeight
  const imageY = hasText ? bodyTop + textHeight + imageGap : bodyTop
  const imageMarkup =
    hasImage && safeNoteImage && imageHeight > 0
      ? `
        <clipPath id="note-card-media">
          <rect x="${bodyX}" y="${imageY}" width="${bodyWidth}" height="${imageHeight}" rx="24" />
        </clipPath>
        <rect x="${bodyX}" y="${imageY}" width="${bodyWidth}" height="${imageHeight}" rx="24" fill="rgba(255,255,255,0.05)" />
        <image href="${safeNoteImage}" x="${bodyX}" y="${imageY}" width="${bodyWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#note-card-media)" />
      `
      : ''
  const cardHeightWithPadding = cardBottom + OUTER_PADDING_Y

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${cardHeightWithPadding}" viewBox="0 0 ${CARD_WIDTH} ${cardHeightWithPadding}">
      <defs>
        <linearGradient id="share-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${gradientStart}" />
          <stop offset="100%" stop-color="${gradientEnd}" />
        </linearGradient>
        <clipPath id="note-card-avatar">
          <circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${avatarInnerRadius}" />
        </clipPath>
      </defs>

      <rect width="100%" height="100%" rx="36" fill="url(#share-gradient)" />
      <rect x="${CONTENT_X}" y="${CONTENT_Y}" width="${CONTENT_WIDTH}" height="${cardHeight}" rx="34" fill="#16101f" />

      <circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${avatarRadius}" fill="rgba(255,255,255,0.08)" />
      <image href="${safeAvatar}" x="${avatarX}" y="${avatarY}" width="66" height="66" preserveAspectRatio="xMidYMid slice" clip-path="url(#note-card-avatar)" />

      <text x="${displayNameX}" y="${displayNameY}" fill="#fafaff" font-size="24" font-family="Inter, Arial, sans-serif" font-weight="700">${safeDisplayName}</text>
      <text x="${displayNameX}" y="${handleY}" fill="rgba(250,250,255,0.78)" font-size="16" font-family="Inter, Arial, sans-serif">${safeHandle}</text>
      <text x="${timestampX}" y="${timestampY}" text-anchor="end" fill="rgba(250,250,255,0.72)" font-size="16" font-family="Inter, Arial, sans-serif">${safeTimestamp}</text>

      ${textMarkup}
      ${imageMarkup}

      <line x1="${bodyX}" y1="${footerLineY}" x2="${CONTENT_X + CONTENT_WIDTH - 44}" y2="${footerLineY}" stroke="rgba(255,255,255,0.10)" stroke-width="2" />
      <text x="${bodyX}" y="${footerTextY}" fill="rgba(250,250,255,0.46)" font-size="17" font-family="Inter, Arial, sans-serif">Halo</text>
      <text x="${CONTENT_X + CONTENT_WIDTH - 44}" y="${footerTextY}" text-anchor="end" fill="rgba(250,250,255,0.46)" font-size="17" font-family="Inter, Arial, sans-serif">via Nostr</text>
    </svg>
  `

  return {
    svg,
    width: CARD_WIDTH,
    height: cardHeightWithPadding
  }
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (nextLine.length <= maxCharsPerLine) {
      currentLine = nextLine
      return
    }

    if (currentLine) {
      lines.push(currentLine)
      currentLine = word
      return
    }

    lines.push(word.slice(0, maxCharsPerLine - 1) + '…')
    currentLine = ''
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const truncatedLines = lines.slice(0, maxLines)
  truncatedLines[maxLines - 1] = truncatedLines[maxLines - 1].replace(/[.…]*$/, '') + '…'
  return truncatedLines
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getShareCardImageHeight({
  dimensions,
  width,
  hasText
}: {
  dimensions?: { width: number; height: number }
  width: number
  hasText: boolean
}) {
  const minHeight = hasText ? 200 : 240
  const maxHeight = hasText ? 310 : 380

  if (!dimensions?.width || !dimensions?.height) {
    return hasText ? 240 : 300
  }

  const rawHeight = width * (dimensions.height / dimensions.width)
  return Math.round(Math.max(minHeight, Math.min(maxHeight, rawHeight)))
}

async function renderShareCardToPngBlob(shareCard: { svg: string; width: number; height: number }) {
  const svgBlob = new Blob([shareCard.svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = shareCard.width * scale
    canvas.height = shareCard.height * scale

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Unable to create canvas context')
    }

    context.scale(scale, scale)
    context.drawImage(image, 0, 0, shareCard.width, shareCard.height)

    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export image'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read blob'))
        return
      }

      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

async function resolveImageToDataUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Image request failed with ${response.status}`)
  }

  const imageBlob = await response.blob()
  return blobToDataUrl(imageBlob)
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
