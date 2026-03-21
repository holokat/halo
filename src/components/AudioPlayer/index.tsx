import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import mediaManager from '@/services/media-manager.service'
import { Minimize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setError(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
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
      const nextTime = Math.min(startTime, maxTime)
      audio.currentTime = nextTime
      setCurrentTime(nextTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      if (isMinimized) {
        mediaManager.stopAudioBackground()
      }
    }
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
      syncStartTime()
    }
    const handleVolumeChange = () => {
      setIsMuted(audio.muted || audio.volume === 0)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('volumechange', handleVolumeChange)

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
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('volumechange', handleVolumeChange)
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

  const handleTogglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      await mediaManager.play(audio)
    } else {
      mediaManager.pause(audio)
    }
  }

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    const nextTime = value[0] ?? 0
    setCurrentTime(nextTime)
    if (!audio) return
    audio.currentTime = nextTime
  }

  const handleToggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setIsMuted(audio.muted)
  }

  if (error) {
    return <ExternalLink url={src} />
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card/80 p-2 backdrop-blur supports-[backdrop-filter]:bg-card/60',
        className
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        className="hidden"
        onError={() => setError(true)}
      />

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        onClick={handleTogglePlay}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? (
          <Pause className="size-4" fill="currentColor" />
        ) : (
          <Play className="size-4" fill="currentColor" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        <Slider
          value={[currentTime]}
          max={Math.max(duration, 1)}
          step={0.1}
          onValueChange={handleSeek}
          hideThumb
          enableHoverAnimation
        />
        <div className="mt-1 flex items-center justify-between px-0.5 text-[11px] font-mono text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
        onClick={handleToggleMute}
        aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
      >
        {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </Button>

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

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
