import { MEDIA_STYLE } from '@/constants'
import { isShortMp4LoopCandidateUrl, shouldLoopShortMp4Duration } from '@/lib/short-mp4-loop'
import { cn, isInViewport, isPartiallyInViewport } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMediaStyle } from '@/providers/MediaStyleProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import mediaManager from '@/services/media-manager.service'
import { useEffect, useRef, useState } from 'react'
import ExternalLink from '../ExternalLink'

export default function VideoPlayer({
  src,
  className,
  compactMedia = false,
  isSingleMedia = true,
  isGifLike = false
}: {
  src: string
  className?: string
  compactMedia?: boolean
  isSingleMedia?: boolean
  isGifLike?: boolean
}) {
  const { mediaStyle } = useMediaStyle()
  const isFullWidth = mediaStyle === MEDIA_STYLE.FULL_WIDTH && isSingleMedia
  const { autoplay } = useContentPolicy()
  const { muteMedia, updateMuteMedia } = useUserPreferences()
  const [error, setError] = useState(false)
  const [shortMp4Loop, setShortMp4Loop] = useState(false)
  const [shortMp4CheckPending, setShortMp4CheckPending] = useState(() =>
    isShortMp4LoopCandidateUrl(src)
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendersAsGifLike = isGifLike || shortMp4Loop
  const rendersAsGifLikeRef = useRef(rendersAsGifLike)
  const hideControls = rendersAsGifLike || shortMp4CheckPending

  useEffect(() => {
    setShortMp4Loop(false)
    setShortMp4CheckPending(!isGifLike && isShortMp4LoopCandidateUrl(src))
    rendersAsGifLikeRef.current = isGifLike
  }, [isGifLike, src])

  useEffect(() => {
    rendersAsGifLikeRef.current = rendersAsGifLike
  }, [rendersAsGifLike])

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current

    if (!video || !container || error) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (autoplay || rendersAsGifLike)) {
          setTimeout(() => {
            const canPlay = rendersAsGifLike
              ? isPartiallyInViewport(container)
              : isInViewport(container)

            if (canPlay) {
              if (rendersAsGifLike) {
                video.muted = true
                void video.play().catch(() => undefined)
              } else {
                mediaManager.autoPlay(video)
              }
            }
          }, 200)
        }

        if (!entry.isIntersecting) {
          if (rendersAsGifLike) {
            video.pause()
          } else {
            mediaManager.pause(video)
          }
        }
      },
      { threshold: rendersAsGifLike ? 0.25 : 1 }
    )

    observer.observe(container)

    return () => {
      observer.unobserve(container)
    }
  }, [autoplay, error, rendersAsGifLike])

  useEffect(() => {
    if (!videoRef.current) return

    const video = videoRef.current

    const handleVolumeChange = () => {
      if (rendersAsGifLikeRef.current) return
      updateMuteMedia(video.muted)
    }

    video.addEventListener('volumechange', handleVolumeChange)

    return () => {
      video.removeEventListener('volumechange', handleVolumeChange)
    }
  }, [updateMuteMedia])

  useEffect(() => {
    const video = videoRef.current
    if (rendersAsGifLike) {
      if (video && !video.muted) {
        video.muted = true
      }
      return
    }
    if (!video || video.muted === muteMedia) return

    if (muteMedia) {
      video.muted = true
    } else {
      video.muted = false
    }
  }, [rendersAsGifLike, muteMedia])

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container || !rendersAsGifLike || error) return

    video.muted = true
    video.loop = true
    video.controls = false

    if (isPartiallyInViewport(container)) {
      void video.play().catch(() => undefined)
    }
  }, [error, rendersAsGifLike, src])

  if (error) {
    return <ExternalLink url={src} />
  }

  return (
    <div ref={containerRef}>
      <video
        ref={videoRef}
        playsInline
        className={cn(
          compactMedia
            ? 'w-20 h-20 object-cover'
            : isFullWidth
              ? 'w-full border'
              : 'max-h-[80vh] sm:max-h-[60vh] border',
          className
        )}
        style={{ borderRadius: 'var(--media-radius, 12px)' }}
        src={src}
        preload="metadata"
        loop={rendersAsGifLike}
        autoPlay={rendersAsGifLike}
        onClick={(e) => e.stopPropagation()}
        onLoadedMetadata={(event) => {
          if (isGifLike || !isShortMp4LoopCandidateUrl(src)) {
            setShortMp4CheckPending(false)
            return
          }

          const shouldLoop = shouldLoopShortMp4Duration(event.currentTarget.duration)
          rendersAsGifLikeRef.current = shouldLoop
          setShortMp4Loop(shouldLoop)
          setShortMp4CheckPending(false)

          if (shouldLoop) {
            event.currentTarget.muted = true
            event.currentTarget.loop = true
            event.currentTarget.controls = false
          }
        }}
        onPlay={(event) => {
          if (!rendersAsGifLikeRef.current) {
            mediaManager.play(event.currentTarget)
          }
        }}
        controls={!hideControls}
        muted={rendersAsGifLike || muteMedia}
        onError={() => setError(true)}
      />
    </div>
  )
}
