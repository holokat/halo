import { useFetchWebMetadata } from '@/hooks/useFetchWebMetadata'
import { cn } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMemo } from 'react'
import Image from '../Image'

export default function WebPreview({ url, pubkey, className }: { url: string; pubkey?: string; className?: string }) {
  const { shouldAutoLoadMedia } = useContentPolicy()
  const { title, description, image } = useFetchWebMetadata(url)

  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }, [url])

  const autoLoadMedia = shouldAutoLoadMedia(pubkey)

  // Don't show preview if auto-load media is disabled
  if (!autoLoadMedia) {
    return null
  }

  // If we have metadata, show the full card
  if (title) {
    return (
      <div
        className={cn(
          'p-3 clickable flex gap-3 w-full border overflow-hidden relative group',
          className
        )}
        style={{ borderRadius: 'var(--media-radius, 12px)' }}
        onClick={(e) => {
          e.stopPropagation()
          window.open(url, '_blank')
        }}
      >
        {image && (
          <Image
            image={{ url: image }}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-md flex-shrink-0"
            hideIfError
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold line-clamp-2 text-sm sm:text-base leading-snug">{title}</div>
          {description && (
            <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-0.5">{description}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1">{hostname}</div>
        </div>
      </div>
    )
  }

  // No metadata available - this means proxy is not configured
  // Just return null, the URL is already shown as a clickable link in the content
  return null
}
