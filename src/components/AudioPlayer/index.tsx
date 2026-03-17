import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import mediaManager from '@/services/media-manager.service'
import { Minimize2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ExternalLink from '../ExternalLink'

interface AudioPlayerProps {
  src: string
  autoPlay?: boolean
  startTime?: number
  isMinimized?: boolean
  className?: string
}

export default function AudioPlayer({
  src,
  autoPlay = false,
  startTime,
  isMinimized = false,
  className
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncStartTime = () => {
      if (startTime === undefined) return
      if (!Number.isFinite(startTime) || startTime < 0) {
        audio.currentTime = 0
        return
      }

      const maxTime = Number.isFinite(audio.duration) ? audio.duration : startTime
      audio.currentTime = Math.min(startTime, maxTime)
    }

    const handlePlay = () => {
      void mediaManager.play(audio)
    }
    const handlePause = () => {
      mediaManager.pause(audio)
    }
    const handleEnded = () => {
      mediaManager.pause(audio)
      if (isMinimized) {
        mediaManager.stopAudioBackground()
      }
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', syncStartTime)

    if (startTime !== undefined && audio.readyState >= 1) {
      syncStartTime()
    }

    if (autoPlay) {
      void mediaManager.play(audio)
    }

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', syncStartTime)
      mediaManager.pause(audio)
    }
  }, [autoPlay, isMinimized, startTime, src])

  useEffect(() => {
    const audio = audioRef.current
    const container = containerRef.current

    if (!audio || !container || isMinimized) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          mediaManager.pause(audio)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [isMinimized])

  const handleMoveToBackground = () => {
    mediaManager.playAudioBackground(src, audioRef.current?.currentTime || 0)
    mediaManager.pause(audioRef.current)
  }

  if (error) {
    return <ExternalLink url={src} />
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex w-full items-center gap-2 rounded-xl border bg-card/80 p-2', className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        controls
        playsInline
        className="min-w-0 flex-1"
        onError={() => setError(true)}
      />

      {isMinimized ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => mediaManager.stopAudioBackground()}
          aria-label="Close background audio"
        >
          <X className="size-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleMoveToBackground}
          aria-label="Move audio to background player"
        >
          <Minimize2 className="size-4" />
        </Button>
      )}
    </div>
  )
}
