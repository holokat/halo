import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Radio,
  Users,
  Send,
  Zap as ZapIcon,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Pin,
  PictureInPicture2,
  Maximize2,
  Minimize2
} from 'lucide-react'
import UserAvatar from '@/components/UserAvatar'
import Username from '@/components/Username'
import ZapDialog from '@/components/ZapDialog'
import RelayFetchState from '@/components/RelayFetchState'
import { Event as NostrEvent } from 'nostr-tools'
import { ChatMessage } from './ChatMessage'
import { formatMediaTime } from './live-stream-view.utils'
import { useLiveStreamView } from './useLiveStreamView'

export default function LiveStreamView({
  naddr,
  initialEvent
}: {
  naddr?: string
  initialEvent?: NostrEvent
}) {
  const {
    chatContainerRef,
    chatMessages,
    currentParticipants,
    currentTime,
    decodedEvent,
    duration,
    hasDuration,
    image,
    isAboutOpen,
    isFullscreen,
    isInPopout,
    isLoading,
    isPinnedToWidget,
    isSending,
    isSmallScreen,
    isStreamZapOpen,
    isVideoMuted,
    isVideoPlaying,
    liveEvent,
    message,
    openPopoutPlayer,
    relayCount,
    retry,
    sendMessage,
    setIsAboutOpen,
    setIsStreamZapOpen,
    setMessage,
    showSlowLoading,
    showTimelineLabels,
    streamingUrl,
    status,
    summary,
    t,
    title,
    toggleFullscreen,
    togglePinToWidget,
    toggleVideoMute,
    toggleVideoPlayback,
    videoContainerRef,
    videoRef,
    zaps,
    zapLiveEvent,
    handleChatScroll,
    handleSeek,
    handleVideoDurationChange,
    handleVideoEnded,
    handleVideoLoadedMetadata,
    handleVideoPause,
    handleVideoPlay,
    handleVideoTimeUpdate,
    handleVideoVolumeChange
  } = useLiveStreamView({ naddr, initialEvent })

  if (isLoading) {
    if (showSlowLoading) {
      return (
        <RelayFetchState
          mode="slow"
          relayCount={relayCount}
          onRetry={retry}
          className="h-[calc(100dvh-8rem)]"
        />
      )
    }

    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }

  if (!liveEvent || !decodedEvent) {
    return (
      <RelayFetchState
        mode="not-found"
        relayCount={relayCount}
        onRetry={retry}
        className="h-[calc(100dvh-8rem)]"
      />
    )
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full min-w-0 max-w-full flex-col overflow-hidden overflow-x-hidden">
      <div className="shrink-0 border-b bg-background px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar userId={liveEvent.pubkey} size="small" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Username userId={liveEvent.pubkey} noLink className="truncate" />
              <Badge variant="destructive" className="flex items-center gap-1 bg-red-600 text-white">
                <Radio className="h-3 w-3 animate-pulse" />
                {status === 'live' ? t('LIVE') : status?.toUpperCase()}
              </Badge>
              {currentParticipants && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {currentParticipants} {t('watching')}
                </span>
              )}
            </div>
          </div>
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setIsAboutOpen((previous) => !previous)}
            >
              {t('About')} {isAboutOpen ? '−' : '+'}
            </Button>
          )}
          <Button onClick={zapLiveEvent} size="icon" className="h-8 w-8 shrink-0" title={t('Zap this stream')}>
            <ZapIcon className="h-4 w-4" />
          </Button>
        </div>
        {summary && isAboutOpen && <p className="mt-2 text-sm text-muted-foreground">{summary}</p>}
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(220px,42vh)_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden border-b bg-black">
          {streamingUrl ? (
            <div ref={videoContainerRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={streamingUrl}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                onPlay={(event) => void handleVideoPlay(event.currentTarget)}
                onPause={handleVideoPause}
                onEnded={handleVideoEnded}
                onTimeUpdate={(event) => handleVideoTimeUpdate(event.currentTarget)}
                onLoadedMetadata={(event) => handleVideoLoadedMetadata(event.currentTarget)}
                onDurationChange={(event) => handleVideoDurationChange(event.currentTarget)}
                onVolumeChange={(event) => handleVideoVolumeChange(event.currentTarget)}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2">
                <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 overflow-hidden text-white/90">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 bg-black/10 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={toggleVideoPlayback}
                  >
                    {isVideoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 bg-black/10 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={toggleVideoMute}
                  >
                    {isVideoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>

                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {hasDuration ? (
                      <>
                        {showTimelineLabels && (
                          <span className="w-11 shrink-0 text-[11px] tabular-nums text-white/70">
                            {formatMediaTime(currentTime)}
                          </span>
                        )}
                        <Slider
                          value={[Math.min(currentTime, duration)]}
                          max={duration}
                          step={1}
                          onValueChange={handleSeek}
                          hideThumb
                          className="min-w-0 flex-1"
                        />
                        {showTimelineLabels && (
                          <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-white/70">
                            {formatMediaTime(duration)}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 shrink-0 text-white/80 hover:bg-white/10 hover:text-white ${
                        isInPopout ? 'bg-white/20 text-white' : ''
                      }`}
                      onClick={openPopoutPlayer}
                      disabled={!streamingUrl}
                      title={isInPopout ? 'Popout player active' : 'Open popout player'}
                    >
                      <PictureInPicture2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 shrink-0 text-white/80 hover:bg-white/10 hover:text-white ${
                        isPinnedToWidget ? 'bg-white/20 text-white' : ''
                      }`}
                      onClick={togglePinToWidget}
                      disabled={!streamingUrl || !naddr}
                      title={isPinnedToWidget ? t('Pinned to widget') : t('Pin to widget')}
                    >
                      <Pin className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : image ? (
            <img src={image} alt={title} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              Stream source unavailable
            </div>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden">
          {zaps.length > 0 && (
            <div className="shrink-0 border-b px-2 py-1">
              <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                {zaps.slice(0, 20).map((zap) => (
                  <div
                    key={zap.id}
                    className="flex flex-shrink-0 items-center gap-1 rounded-full border bg-card px-2 py-0.5"
                  >
                    <UserAvatar userId={zap.pubkey} size="xSmall" />
                    <span className="text-xs font-semibold text-yellow-500">{zap.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0 border-b px-2.5 py-1.5 text-sm font-semibold">
            {t('Live Chat')} ({chatMessages.length})
          </div>

          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="scrollbar-thin flex-1 min-h-0 min-w-0 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-1.5"
          >
            {chatMessages.map((msg) => (
              <ChatMessage key={msg.id} event={msg} isSmallScreen={isSmallScreen} />
            ))}

            {chatMessages.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('No messages yet. Be the first to chat!')}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('Type a message...')}
                className="h-9 min-h-0 max-h-20 resize-none py-1.5 text-sm leading-tight"
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage()
                  }
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={!message.trim() || isSending}
                size="icon"
                className="h-9 w-9 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {liveEvent && (
        <ZapDialog open={isStreamZapOpen} setOpen={setIsStreamZapOpen} pubkey={liveEvent.pubkey} event={liveEvent} />
      )}
    </div>
  )
}
