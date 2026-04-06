import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Event as NostrEvent } from 'nostr-tools'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useLiveStreamPopout } from '@/providers/LiveStreamPopoutProvider'
import { useWidgets } from '@/providers/WidgetsProvider'
import client from '@/services/client.service'
import mediaManager from '@/services/media-manager.service'
import liveStreamSyncService, { TLiveStreamSyncCommand } from '@/services/live-stream-sync.service'
import {
  DEFAULT_LIVE_RELAYS,
  LIVE_STREAM_LOADING_TIMEOUT,
  decodeLiveNaddr,
  getAddressTag,
  getPrimaryStreamRelays,
  getStreamRelays,
  isMatchingLiveAddress,
  LiveZap,
  formatMediaTime
} from './live-stream-view.utils'

export function useLiveStreamView({
  naddr,
  initialEvent
}: {
  naddr?: string
  initialEvent?: NostrEvent
}) {
  const { t } = useTranslation()
  const { pubkey, checkLogin, publish } = useNostr()
  const { isSmallScreen } = useScreenSize()
  const { openPopout, isPopoutOpenForUrl } = useLiveStreamPopout()
  const { pinLiveStreamWidget, unpinLiveStreamByNaddr, isLiveStreamPinned } = useWidgets()
  const decodedEvent = useMemo(() => decodeLiveNaddr(naddr), [naddr])
  const [liveEvent, setLiveEvent] = useState<NostrEvent | null>(null)
  const [chatMessages, setChatMessages] = useState<NostrEvent[]>([])
  const [zaps, setZaps] = useState<LiveZap[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showSlowLoading, setShowSlowLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isStreamZapOpen, setIsStreamZapOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const prevChatCountRef = useRef(0)
  const autoScrollRef = useRef(true)
  const chatScrollRafRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const sourceIdRef = useRef(`live-stream-view-${Math.random().toString(36).slice(2)}`)
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [showTimelineLabels, setShowTimelineLabels] = useState(false)

  const activeStreamingUrl = useMemo(
    () => liveEvent?.tags.find((tag) => tag[0] === 'streaming')?.[1],
    [liveEvent]
  )
  const isInPopout = isPopoutOpenForUrl(activeStreamingUrl)
  const isPinnedToWidget = isLiveStreamPinned(naddr)
  const relayCount = useMemo(
    () => (decodedEvent ? getStreamRelays(decodedEvent).length : 0),
    [decodedEvent]
  )

  const title = liveEvent?.tags.find((tag) => tag[0] === 'title')?.[1] || t('Untitled Live Stream')
  const summary = liveEvent?.tags.find((tag) => tag[0] === 'summary')?.[1]
  const image = liveEvent?.tags.find((tag) => tag[0] === 'image')?.[1]
  const currentParticipants = liveEvent?.tags.find((tag) => tag[0] === 'current_participants')?.[1]
  const status = liveEvent?.tags.find((tag) => tag[0] === 'status')?.[1]
  const streamingUrl = activeStreamingUrl
  const hasDuration = Number.isFinite(duration) && duration > 0

  const clearLoadingTimeout = useCallback(() => {
    if (!loadingTimeoutRef.current) return
    clearTimeout(loadingTimeoutRef.current)
    loadingTimeoutRef.current = null
  }, [])

  const clearSlowLoadingTimeout = useCallback(() => {
    if (!slowLoadingTimeoutRef.current) return
    clearTimeout(slowLoadingTimeoutRef.current)
    slowLoadingTimeoutRef.current = null
  }, [])

  useEffect(() => {
    if (!decodedEvent) {
      clearLoadingTimeout()
      clearSlowLoadingTimeout()
      setIsLoading(false)
      setShowSlowLoading(false)
      setLiveEvent(null)
      setChatMessages([])
      setZaps([])
      setCurrentTime(0)
      setDuration(0)
      setIsVideoPlaying(false)
      return
    }

    const relays = getStreamRelays(decodedEvent)
    const primaryRelays = getPrimaryStreamRelays(decodedEvent, initialEvent).filter((relay) =>
      relays.includes(relay)
    )
    const seedRelays = primaryRelays.length > 0 ? primaryRelays : relays.slice(0, 3)
    const fallbackRelays = relays.filter((relay) => !seedRelays.includes(relay))
    const addressTag = getAddressTag(decodedEvent)
    const hydratedInitialEvent =
      initialEvent && isMatchingLiveAddress(initialEvent, decodedEvent) ? initialEvent : null
    const closers: Array<{ close: () => void }> = []
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    let isDisposed = false
    let hasLiveEvent = !!hydratedInitialEvent

    clearLoadingTimeout()
    clearSlowLoadingTimeout()
    setIsLoading(!hydratedInitialEvent)
    setShowSlowLoading(false)
    setLiveEvent(hydratedInitialEvent)
    setChatMessages([])
    setZaps([])
    setCurrentTime(0)
    setDuration(0)
    setIsVideoPlaying(false)

    if (!hydratedInitialEvent) {
      loadingTimeoutRef.current = setTimeout(() => {
        setIsLoading(false)
        loadingTimeoutRef.current = null
      }, LIVE_STREAM_LOADING_TIMEOUT)
      slowLoadingTimeoutRef.current = setTimeout(() => {
        setShowSlowLoading(true)
        slowLoadingTimeoutRef.current = null
      }, 3500)
    }

    const applyLiveEvent = (event: NostrEvent) => {
      hasLiveEvent = true
      setLiveEvent((previous) => {
        if (!previous) return event
        return event.created_at > previous.created_at ? event : previous
      })
      setIsLoading(false)
      setShowSlowLoading(false)
      clearLoadingTimeout()
      clearSlowLoadingTimeout()
    }

    const subscribeToRelays = (targetRelays: string[]) => {
      if (targetRelays.length === 0) return

      const liveSub = client.subscribe(
        targetRelays,
        {
          kinds: [decodedEvent.kind],
          authors: [decodedEvent.pubkey],
          '#d': [decodedEvent.identifier],
          limit: 20
        },
        {
          onevent: (event: NostrEvent) => {
            applyLiveEvent(event)
          },
          oneose: () => {
            // Intentionally no-op.
          }
        }
      )
      closers.push(liveSub)

      const chatSub = client.subscribe(
        targetRelays,
        {
          kinds: [1311],
          '#a': [addressTag],
          limit: 300
        },
        {
          onevent: (event: NostrEvent) => {
            setChatMessages((previous) => {
              if (previous.some((item) => item.id === event.id)) return previous
              return [...previous, event].sort((a, b) => a.created_at - b.created_at)
            })
          }
        }
      )
      closers.push(chatSub)

      const zapsSub = client.subscribe(
        targetRelays,
        {
          kinds: [9735],
          '#a': [addressTag],
          limit: 100
        },
        {
          onevent: (event: NostrEvent) => {
            const zapInfo = getZapInfoFromEvent(event)
            if (!zapInfo?.amount || !zapInfo.senderPubkey) return
            const senderPubkey = zapInfo.senderPubkey

            setZaps((previous) => {
              if (previous.some((item) => item.id === event.id)) return previous

              const nextZap: LiveZap = {
                id: event.id,
                pubkey: senderPubkey,
                amount: zapInfo.amount,
                created_at: event.created_at,
                comment: zapInfo.comment
              }
              return [...previous, nextZap].sort((a, b) => b.created_at - a.created_at)
            })
          }
        }
      )
      closers.push(zapsSub)
    }

    const queryLiveEvent = (targetRelays: string[]) =>
      client
        .querySync(targetRelays, {
          kinds: [decodedEvent.kind],
          authors: [decodedEvent.pubkey],
          '#d': [decodedEvent.identifier],
          limit: 10
        })
        .then((events) => {
          if (isDisposed || events.length === 0) return false
          const latest = events.sort((a, b) => b.created_at - a.created_at)[0]
          if (!latest) return false
          applyLiveEvent(latest)
          return true
        })
        .catch(() => false)

    subscribeToRelays(seedRelays)
    queryLiveEvent(seedRelays).then((found) => {
      if (!found && fallbackRelays.length > 0) {
        queryLiveEvent(fallbackRelays)
      }
    })

    if (fallbackRelays.length > 0) {
      fallbackTimer = setTimeout(() => {
        if (isDisposed) return
        subscribeToRelays(fallbackRelays)
        if (!hasLiveEvent) {
          queryLiveEvent(fallbackRelays)
        }
      }, hydratedInitialEvent ? 2500 : 1200)
    }

    return () => {
      isDisposed = true
      clearLoadingTimeout()
      clearSlowLoadingTimeout()
      if (fallbackTimer) {
        clearTimeout(fallbackTimer)
      }
      closers.forEach((closer) => closer.close())
    }
  }, [clearLoadingTimeout, clearSlowLoadingTimeout, decodedEvent, initialEvent, loadAttempt])

  const scrollChatToBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [])

  const scheduleScrollChatToBottom = useCallback(() => {
    if (chatScrollRafRef.current !== null) {
      cancelAnimationFrame(chatScrollRafRef.current)
    }
    chatScrollRafRef.current = requestAnimationFrame(() => {
      scrollChatToBottom()
      chatScrollRafRef.current = null
    })
  }, [scrollChatToBottom])

  const handleChatScroll = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    autoScrollRef.current = distanceFromBottom <= 48
  }, [])

  useEffect(() => {
    return () => {
      clearLoadingTimeout()
      clearSlowLoadingTimeout()
      if (chatScrollRafRef.current !== null) {
        cancelAnimationFrame(chatScrollRafRef.current)
      }
    }
  }, [clearLoadingTimeout, clearSlowLoadingTimeout])

  useEffect(() => {
    const count = chatMessages.length
    const prevCount = prevChatCountRef.current

    if (count === 0) {
      prevChatCountRef.current = 0
      return
    }

    if (prevCount === 0 || (count > prevCount && autoScrollRef.current)) {
      scheduleScrollChatToBottom()
    }

    prevChatCountRef.current = count
  }, [chatMessages.length, scheduleScrollChatToBottom])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === videoContainerRef.current)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const container = videoContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const update = () => {
      setShowTimelineLabels(container.clientWidth >= 700)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const sendMessage = useCallback(async () => {
    if (!message.trim() || !decodedEvent || !pubkey) {
      await checkLogin()
      return
    }

    setIsSending(true)

    try {
      const draft = {
        kind: 1311,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['a', getAddressTag(decodedEvent), '', 'root']],
        content: message.trim()
      }

      const relays =
        decodedEvent.relays && decodedEvent.relays.length > 0
          ? decodedEvent.relays
          : DEFAULT_LIVE_RELAYS

      await publish(draft, { additionalRelayUrls: relays })
      setMessage('')
      autoScrollRef.current = true
      scheduleScrollChatToBottom()
    } catch (error) {
      console.error('Failed to send live chat message:', error)
    } finally {
      setIsSending(false)
    }
  }, [checkLogin, decodedEvent, message, pubkey, publish, scheduleScrollChatToBottom])

  const zapLiveEvent = useCallback(() => {
    if (!liveEvent) return
    setIsStreamZapOpen(true)
  }, [liveEvent])

  const toggleVideoPlayback = useCallback(async () => {
    if (isInPopout) return

    const video = videoRef.current
    if (!video || !activeStreamingUrl) return

    try {
      if (video.paused) {
        const played = await mediaManager.play(video)
        setIsVideoPlaying(played)
        if (!played) return
        liveStreamSyncService.setState(activeStreamingUrl, {
          isPlaying: true,
          activeSourceId: sourceIdRef.current
        })
        liveStreamSyncService.dispatchCommand({
          streamingUrl: activeStreamingUrl,
          action: 'play',
          sourceId: sourceIdRef.current
        })
      } else {
        mediaManager.pause(video)
        liveStreamSyncService.setState(activeStreamingUrl, {
          isPlaying: false,
          activeSourceId: sourceIdRef.current
        })
        liveStreamSyncService.dispatchCommand({
          streamingUrl: activeStreamingUrl,
          action: 'pause',
          sourceId: sourceIdRef.current
        })
      }
    } catch (error) {
      console.error('Failed to toggle video playback:', error)
    }
  }, [activeStreamingUrl, isInPopout])

  const toggleVideoMute = useCallback(() => {
    const video = videoRef.current
    if (!video || !activeStreamingUrl) return
    video.muted = !video.muted
    setIsVideoMuted(video.muted)
    liveStreamSyncService.setState(activeStreamingUrl, { isMuted: video.muted })
    liveStreamSyncService.dispatchCommand({
      streamingUrl: activeStreamingUrl,
      action: 'set-muted',
      muted: video.muted,
      sourceId: sourceIdRef.current
    })
  }, [activeStreamingUrl])

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return

    const next = value[0] ?? 0
    video.currentTime = next
    setCurrentTime(next)
  }, [])

  const handleVideoPlay = useCallback(
    async (video: HTMLVideoElement) => {
      if (isInPopout) {
        mediaManager.pause(video)
        setIsVideoPlaying(false)
        if (activeStreamingUrl) {
          const sharedState = liveStreamSyncService.getState(activeStreamingUrl)
          if (!sharedState?.activeSourceId || sharedState.activeSourceId === sourceIdRef.current) {
            liveStreamSyncService.setState(activeStreamingUrl, {
              isPlaying: false,
              activeSourceId: sourceIdRef.current
            })
          }
        }
        return
      }

      const played = await mediaManager.play(video)
      setIsVideoPlaying(played)
      if (played && activeStreamingUrl) {
        liveStreamSyncService.setState(activeStreamingUrl, {
          isPlaying: true,
          activeSourceId: sourceIdRef.current
        })
      }
    },
    [activeStreamingUrl, isInPopout]
  )

  const handleVideoPause = useCallback(() => {
    setIsVideoPlaying(false)
    if (activeStreamingUrl) {
      const sharedState = liveStreamSyncService.getState(activeStreamingUrl)
      if (!sharedState?.activeSourceId || sharedState.activeSourceId === sourceIdRef.current) {
        liveStreamSyncService.setState(activeStreamingUrl, {
          isPlaying: false,
          activeSourceId: sourceIdRef.current
        })
      }
    }
  }, [activeStreamingUrl])

  const handleVideoEnded = useCallback(() => {
    handleVideoPause()
  }, [handleVideoPause])

  const handleVideoTimeUpdate = useCallback((video: HTMLVideoElement) => {
    setCurrentTime(video.currentTime)
  }, [])

  const handleVideoLoadedMetadata = useCallback(
    (video: HTMLVideoElement) => {
      const nextDuration = video.duration
      setDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
      setIsVideoMuted(video.muted)
      if (activeStreamingUrl) {
        liveStreamSyncService.setState(activeStreamingUrl, {
          isMuted: video.muted,
          isPlaying: !video.paused
        })
      }
    },
    [activeStreamingUrl]
  )

  const handleVideoDurationChange = useCallback((video: HTMLVideoElement) => {
    const nextDuration = video.duration
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
  }, [])

  const handleVideoVolumeChange = useCallback(
    (video: HTMLVideoElement) => {
      setIsVideoMuted(video.muted)
      if (activeStreamingUrl) {
        liveStreamSyncService.setState(activeStreamingUrl, {
          isMuted: video.muted
        })
      }
    },
    [activeStreamingUrl]
  )

  const toggleFullscreen = useCallback(async () => {
    const container = videoContainerRef.current
    if (!container) return

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
      } else {
        await container.requestFullscreen()
      }
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error)
    }
  }, [])

  const openPopoutPlayer = useCallback(() => {
    if (!streamingUrl) return

    const video = videoRef.current
    if (video) {
      liveStreamSyncService.setState(streamingUrl, {
        isMuted: video.muted,
        isPlaying: !video.paused,
        activeSourceId: !video.paused ? sourceIdRef.current : undefined
      })
    }
    if (video && !video.paused) {
      mediaManager.pause(video)
      setIsVideoPlaying(false)
      liveStreamSyncService.dispatchCommand({
        streamingUrl,
        action: 'pause',
        sourceId: sourceIdRef.current
      })
    }

    openPopout({
      streamingUrl,
      title,
      image,
      naddr
    })
  }, [image, naddr, openPopout, streamingUrl, title])

  const togglePinToWidget = useCallback(() => {
    if (!naddr) return
    if (isPinnedToWidget) {
      unpinLiveStreamByNaddr(naddr)
      return
    }
    if (!streamingUrl) return
    pinLiveStreamWidget({
      naddr,
      streamingUrl,
      title,
      image
    })
  }, [image, isPinnedToWidget, naddr, pinLiveStreamWidget, streamingUrl, title, unpinLiveStreamByNaddr])

  const retry = useCallback(() => {
    setLoadAttempt((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!isInPopout) return

    const video = videoRef.current
    if (!video || !activeStreamingUrl) return

    if (!video.paused) {
      mediaManager.pause(video)
      liveStreamSyncService.setState(activeStreamingUrl, {
        isPlaying: false,
        activeSourceId: sourceIdRef.current
      })
      liveStreamSyncService.dispatchCommand({
        streamingUrl: activeStreamingUrl,
        action: 'pause',
        sourceId: sourceIdRef.current
      })
    }
    setIsVideoPlaying(false)
  }, [activeStreamingUrl, isInPopout])

  useEffect(() => {
    if (!activeStreamingUrl) return

    const handleCommand = (event: Event) => {
      const customEvent = event as CustomEvent<TLiveStreamSyncCommand>
      const command = customEvent.detail

      if (!command || command.streamingUrl !== activeStreamingUrl) return
      if (command.sourceId === sourceIdRef.current) return

      const video = videoRef.current
      if (!video) return

      if (command.action === 'play') {
        if (isInPopout) return
        if (!video.paused) {
          mediaManager.pause(video)
        }
        setIsVideoPlaying(false)
        return
      }
      if (command.action === 'pause') {
        mediaManager.pause(video)
        setIsVideoPlaying(false)
        const sharedState = liveStreamSyncService.getState(activeStreamingUrl)
        if (!sharedState?.activeSourceId || sharedState.activeSourceId === sourceIdRef.current) {
          liveStreamSyncService.setState(activeStreamingUrl, {
            isPlaying: false,
            activeSourceId: sourceIdRef.current
          })
        }
        return
      }
      if (command.action === 'set-muted') {
        video.muted = !!command.muted
        setIsVideoMuted(video.muted)
        liveStreamSyncService.setState(activeStreamingUrl, { isMuted: video.muted })
      }
    }

    liveStreamSyncService.addEventListener('command', handleCommand as EventListener)
    return () => {
      liveStreamSyncService.removeEventListener('command', handleCommand as EventListener)
    }
  }, [activeStreamingUrl, isInPopout])

  return {
    activeStreamingUrl,
    chatContainerRef,
    chatMessages,
    currentParticipants,
    currentTime,
    decodedEvent,
    duration,
    formatMediaTime,
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
    loadAttempt,
    message,
    openPopoutPlayer,
    relayCount,
    retry,
    handleChatScroll,
    handleSeek,
    sendMessage,
    setIsAboutOpen,
    setIsStreamZapOpen,
    setMessage,
    handleVideoDurationChange,
    handleVideoEnded,
    handleVideoLoadedMetadata,
    handleVideoPause,
    handleVideoPlay,
    handleVideoTimeUpdate,
    handleVideoVolumeChange,
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
    zapLiveEvent
  }
}
