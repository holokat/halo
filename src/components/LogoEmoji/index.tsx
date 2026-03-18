import { cn } from '@/lib/utils'
import { TEmoji } from '@/types'
import { useEffect, useState } from 'react'

const FALLBACK_LOGO_EMOJI = '⚡'

export default function LogoEmoji({
  emoji,
  size = 24,
  className
}: {
  emoji?: string | TEmoji | null
  size?: number
  className?: string
}) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [emoji])

  if (!emoji || typeof emoji === 'string' || hasError) {
    const nativeEmoji = typeof emoji === 'string' && emoji.trim() ? emoji : FALLBACK_LOGO_EMOJI

    return (
      <span
        className={cn(
          'inline-flex shrink-0 select-none items-center justify-center leading-none',
          className
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          fontSize: `${size}px`
        }}
      >
        {nativeEmoji}
      </span>
    )
  }

  return (
    <img
      src={emoji.url}
      alt={emoji.shortcode}
      className={cn('inline-block shrink-0 rounded-sm object-contain', className)}
      style={{
        width: `${size}px`,
        height: `${size}px`
      }}
      onLoad={() => {
        setHasError(false)
      }}
      onError={() => {
        setHasError(true)
      }}
    />
  )
}
