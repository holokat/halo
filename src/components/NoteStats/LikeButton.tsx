import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ACTUAL_ZAP_SOUNDS, ZAP_SOUNDS } from '@/constants'
import { useNoteStatsById } from '@/hooks/useNoteStatsById'
import { getLightningAddressFromProfile } from '@/lib/lightning'
import {
  getReactionBoostVisualProgress,
  getWeightedReactionCount,
  isStandardLikeEmoji
} from '@/lib/reaction'
import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useDefaultReactionEmojis } from '@/providers/DefaultReactionEmojisProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useZap } from '@/providers/ZapProvider'
import client from '@/services/client.service'
import lightning from '@/services/lightning.service'
import noteStatsService from '@/services/note-stats.service'
import { TEmoji, TNoteReaction } from '@/types'
import { Heart, Loader } from 'lucide-react'
import { Event } from 'nostr-tools'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Emoji from '../Emoji'
import SuggestedEmojis from '../SuggestedEmojis'
import ReactionBoostTrail from './ReactionBoostTrail'
import ReactionBurst from './ReactionBurst'
import {
  beginOptimisticReaction,
  beginOptimisticReactionRemoval,
  type TOptimisticReactionOptions
} from './reaction'
import { formatCount } from './utils'

const EmojiPicker = lazy(() => import('../EmojiPicker'))

const BOOST_ACTIVATION_MS = 420
const BOOST_CHECKPOINT_MS = [140, 280]
const BOOST_INCREMENT_MS = 120
const BOOST_TAP_SLOP_PX = 14
const BOOST_INDICATOR_FADE_MS = 320
const BOOST_INDICATOR_HIDE_MS = 950

function EmojiPickerFallback() {
  return (
    <div className="w-[350px] h-[400px] p-4 flex flex-col gap-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-8 w-full" />
      <div className="grid grid-cols-8 gap-2 flex-1">
        {Array.from({ length: 40 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded" />
        ))}
      </div>
    </div>
  )
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(pattern)
}

const INITIAL_CHARGE_STATE = {
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  activated: false,
  bonusCount: 0
}

export default function LikeButton({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { pubkey, signEvent, checkLogin, attemptDelete } = useNostr()
  const { reactionOptionsEnabled } = useDefaultReactionEmojis()
  const { hideUntrustedInteractions, isUserTrustedForInteractions } = useUserTrust()
  const { zapOnReactions, defaultZapSats, defaultZapComment, zapSound, isWalletConnected } =
    useZap()
  const [liking, setLiking] = useState(false)
  const [isEmojiReactionsOpen, setIsEmojiReactionsOpen] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [canZap, setCanZap] = useState(false)
  const [burstVersion, setBurstVersion] = useState(0)
  const [burstIntensity, setBurstIntensity] = useState(0)
  const [isBoostActive, setIsBoostActive] = useState(false)
  const [boostBonusCount, setBoostBonusCount] = useState(0)
  const [releasedBonusCount, setReleasedBonusCount] = useState(0)
  const [isReleasedBonusFading, setIsReleasedBonusFading] = useState(false)
  const publishInFlightRef = useRef(false)
  const suppressClickRef = useRef(false)
  const chargeStateRef = useRef({ ...INITIAL_CHARGE_STATE })
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkpointTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const incrementTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const indicatorFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indicatorHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteStats = useNoteStatsById(event.id)
  const { myLastReaction, likeCount } = useMemo(() => {
    const stats = noteStats || {}
    const myLike = (stats.likes ?? []).reduce<TNoteReaction | undefined>((latest, like) => {
      if (like.pubkey !== pubkey) return latest
      if (!latest || like.created_at >= latest.created_at) return like
      return latest
    }, undefined)
    const likes = hideUntrustedInteractions
      ? stats.likes?.filter((like) => isUserTrustedForInteractions(like.pubkey))
      : stats.likes

    return {
      myLastReaction: myLike,
      likeCount: getWeightedReactionCount(likes)
    }
  }, [noteStats, pubkey, hideUntrustedInteractions, isUserTrustedForInteractions])

  useEffect(() => {
    if (!zapOnReactions || !isWalletConnected) {
      setCanZap(false)
      return
    }

    client.fetchProfile(event.pubkey).then((profile) => {
      if (!profile) return
      if (pubkey === profile.pubkey) return
      const lightningAddress = getLightningAddressFromProfile(profile)
      if (lightningAddress) setCanZap(true)
    })
  }, [event.pubkey, pubkey, zapOnReactions, isWalletConnected])

  useEffect(() => {
    return () => {
      clearChargeTimers()
      clearReleasedIndicatorTimers()
    }
  }, [])

  const clearChargeTimers = () => {
    if (activationTimerRef.current) {
      clearTimeout(activationTimerRef.current)
      activationTimerRef.current = null
    }

    checkpointTimerRefs.current.forEach((timer) => clearTimeout(timer))
    checkpointTimerRefs.current = []

    if (incrementTimerRef.current) {
      clearInterval(incrementTimerRef.current)
      incrementTimerRef.current = null
    }
  }

  const clearReleasedIndicatorTimers = () => {
    if (indicatorFadeTimerRef.current) {
      clearTimeout(indicatorFadeTimerRef.current)
      indicatorFadeTimerRef.current = null
    }

    if (indicatorHideTimerRef.current) {
      clearTimeout(indicatorHideTimerRef.current)
      indicatorHideTimerRef.current = null
    }
  }

  const resetChargeState = () => {
    clearChargeTimers()
    chargeStateRef.current = { ...INITIAL_CHARGE_STATE }
    setIsBoostActive(false)
    setBoostBonusCount(0)
  }

  const showReleasedIndicator = (bonusCount: number) => {
    clearReleasedIndicatorTimers()

    if (bonusCount <= 0) {
      setReleasedBonusCount(0)
      setIsReleasedBonusFading(false)
      return
    }

    setReleasedBonusCount(bonusCount)
    setIsReleasedBonusFading(false)
    indicatorFadeTimerRef.current = setTimeout(() => {
      setIsReleasedBonusFading(true)
    }, BOOST_INDICATOR_FADE_MS)
    indicatorHideTimerRef.current = setTimeout(() => {
      setReleasedBonusCount(0)
      setIsReleasedBonusFading(false)
    }, BOOST_INDICATOR_HIDE_MS)
  }

  const like = async (
    emoji: string | TEmoji,
    { bonusCount = 0 }: TOptimisticReactionOptions = {}
  ) => {
    checkLogin(async () => {
      if (liking || publishInFlightRef.current || !pubkey) return

      setLiking(true)
      publishInFlightRef.current = true

      try {
        const { publishTask } = beginOptimisticReaction(event, emoji, pubkey, signEvent, {
          bonusCount
        })
        setBurstIntensity(getReactionBoostVisualProgress(bonusCount))
        setBurstVersion((version) => version + 1)
        setLiking(false)

        void publishTask
          .then(() => {
            if (!zapOnReactions || !canZap) return

            Promise.resolve().then(async () => {
              try {
                if (isWalletConnected && zapSound !== ZAP_SOUNDS.NONE) {
                  let soundToPlay = zapSound
                  if (zapSound === ZAP_SOUNDS.RANDOM) {
                    const randomIndex = Math.floor(Math.random() * ACTUAL_ZAP_SOUNDS.length)
                    soundToPlay = ACTUAL_ZAP_SOUNDS[randomIndex]
                  }
                  const audio = new Audio(`/sounds/${soundToPlay}.mp3`)
                  audio.volume = 0.5
                  audio.play().catch(() => {})
                }

                const zapResult = await lightning.zap(
                  pubkey,
                  event,
                  defaultZapSats,
                  defaultZapComment
                )
                if (zapResult) {
                  noteStatsService.addZap(
                    pubkey,
                    event.id,
                    zapResult.invoice,
                    defaultZapSats,
                    defaultZapComment
                  )
                }
              } catch (error) {
                toast.error(`${t('Zap failed')}: ${(error as Error).message}`)
              }
            })
          })
          .catch((error) => {
            console.error('like failed', error)
          })
          .finally(() => {
            publishInFlightRef.current = false
          })
      } catch (error) {
        console.error('like failed', error)
        setLiking(false)
        publishInFlightRef.current = false
      }
    })
  }

  const unlike = async (reaction: TNoteReaction) => {
    checkLogin(async () => {
      if (liking || publishInFlightRef.current || !pubkey) return

      setLiking(true)
      publishInFlightRef.current = true

      try {
        const { deleteTask } = beginOptimisticReactionRemoval(event, reaction, attemptDelete)
        setLiking(false)

        void deleteTask
          .catch((error) => {
            console.error('unlike failed', error)
          })
          .finally(() => {
            publishInFlightRef.current = false
          })
      } catch (error) {
        console.error('unlike failed', error)
        setLiking(false)
        publishInFlightRef.current = false
      }
    })
  }

  const incrementBoostBonus = () => {
    const nextBonusCount = chargeStateRef.current.bonusCount + 1

    chargeStateRef.current.bonusCount = nextBonusCount
    setBoostBonusCount(nextBonusCount)

    if (nextBonusCount > 1 && nextBonusCount % 3 === 0) {
      triggerHaptic(4)
    }
  }

  const activateBoost = () => {
    if (chargeStateRef.current.pointerId === null || chargeStateRef.current.activated) return

    chargeStateRef.current.activated = true
    suppressClickRef.current = true
    setIsBoostActive(true)
    incrementBoostBonus()
    triggerHaptic([8, 18, 12])
    incrementTimerRef.current = setInterval(() => {
      incrementBoostBonus()
    }, BOOST_INCREMENT_MS)
  }

  const cancelBoost = (suppressClick = false) => {
    if (suppressClick) {
      suppressClickRef.current = true
    }
    resetChargeState()
  }

  const handleBoostPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || myLastReaction || liking || publishInFlightRef.current) return

    clearReleasedIndicatorTimers()
    setReleasedBonusCount(0)
    setIsReleasedBonusFading(false)
    suppressClickRef.current = false
    chargeStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      bonusCount: 0
    }

    checkpointTimerRefs.current = BOOST_CHECKPOINT_MS.map((delay) =>
      setTimeout(() => {
        if (chargeStateRef.current.pointerId !== null && !chargeStateRef.current.activated) {
          triggerHaptic(4)
        }
      }, delay)
    )
    activationTimerRef.current = setTimeout(() => {
      activateBoost()
    }, BOOST_ACTIVATION_MS)
  }

  const handleBoostPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (chargeStateRef.current.pointerId !== e.pointerId) return

    const deltaX = e.clientX - chargeStateRef.current.startX
    const deltaY = e.clientY - chargeStateRef.current.startY
    const distance = Math.hypot(deltaX, deltaY)

    if (distance > BOOST_TAP_SLOP_PX) {
      cancelBoost(true)
    }
  }

  const handleBoostPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (chargeStateRef.current.pointerId !== e.pointerId) return

    const wasActivated = chargeStateRef.current.activated
    const finalBonusCount = chargeStateRef.current.bonusCount
    resetChargeState()

    if (wasActivated) {
      showReleasedIndicator(finalBonusCount)
      void like('+', { bonusCount: finalBonusCount })
    }
  }

  const handleBoostPointerCancel = () => {
    if (chargeStateRef.current.pointerId === null) return
    cancelBoost(true)
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (myLastReaction) {
      void unlike(myLastReaction)
      return
    }

    if (!reactionOptionsEnabled) {
      void like('❤️')
      return
    }

    setIsEmojiReactionsOpen(true)
  }

  const displayBonusCount = isBoostActive ? boostBonusCount : releasedBonusCount
  const boostVisualProgress = getReactionBoostVisualProgress(boostBonusCount)
  const releasedBonusVisualProgress = getReactionBoostVisualProgress(releasedBonusCount)
  const heartBeatStyle = isBoostActive
    ? ({
        '--reaction-charge-beat-min-scale': `${1.02 + boostVisualProgress * 0.08}`,
        '--reaction-charge-beat-max-scale': `${1.14 + boostVisualProgress * 0.26}`,
        '--reaction-charge-beat-duration': `${Math.round(760 - boostVisualProgress * 220)}ms`
      } as CSSProperties)
    : undefined
  const bonusIndicatorStyle = displayBonusCount > 0
    ? ({
        transform: isBoostActive
          ? `translateY(${-2 - boostVisualProgress * 2}px) scale(${1.02 + boostVisualProgress * 0.18})`
          : `translateY(${-4 - releasedBonusVisualProgress * (isReleasedBonusFading ? 3 : 1.5)}px) scale(${1 + releasedBonusVisualProgress * 0.08})`
      } as CSSProperties)
    : undefined
  const showStandardLikeState = isBoostActive || isStandardLikeEmoji(myLastReaction?.emoji)
  const trigger = (
    <button
      type="button"
      className={cn(
        'relative flex items-center gap-1 px-3 h-full transition-colors',
        myLastReaction || isBoostActive
          ? 'text-primary'
          : 'text-muted-foreground enabled:hover:text-primary',
        isBoostActive && 'drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]'
      )}
      title={t('Like')}
      disabled={liking}
      onPointerDownCapture={(e) => {
        if (reactionOptionsEnabled && !isSmallScreen) {
          e.preventDefault()
        }
      }}
      onPointerDown={handleBoostPointerDown}
      onPointerMove={handleBoostPointerMove}
      onPointerUp={handleBoostPointerUp}
      onPointerCancel={handleBoostPointerCancel}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') {
          handleBoostPointerCancel()
        }
      }}
      onClick={handleClick}
      onContextMenu={(e) => {
        if (isBoostActive) {
          e.preventDefault()
        }
      }}
      aria-label={myLastReaction ? `${t('React')}, ${t('you reacted')}` : t('React')}
      aria-pressed={!!myLastReaction || isBoostActive}
    >
      {burstVersion > 0 && <ReactionBurst key={burstVersion} intensity={burstIntensity} />}
      {isBoostActive && <ReactionBoostTrail intensity={boostVisualProgress} />}

      {liking ? (
        <Loader className="animate-spin" aria-hidden="true" />
      ) : showStandardLikeState ? (
        <span
          className={cn(
            'inline-flex items-center justify-center motion-reduce:animate-none',
            isBoostActive && 'animate-reaction-charge-beat'
          )}
          style={heartBeatStyle}
        >
          <span
            key={`liked-${burstVersion}`}
            className={cn(
              'inline-flex motion-reduce:animate-none transition-transform duration-150',
              burstVersion > 0 && 'animate-reaction-burst-pop',
              isBoostActive && 'scale-110'
            )}
            style={
              isBoostActive
                ? ({
                    '--reaction-burst-pop-start-scale': `${0.9 + boostVisualProgress * 0.04}`,
                    '--reaction-burst-pop-peak-scale': `${1.18 + boostVisualProgress * 0.18}`
                  } as CSSProperties)
                : undefined
            }
          >
            <Heart className={cn('fill-current', isBoostActive && 'stroke-[2.2]')} aria-hidden="true" />
          </span>
        </span>
      ) : myLastReaction ? (
        <span
          key={`liked-${burstVersion}`}
          className={cn(
            'inline-flex motion-reduce:animate-none',
            burstVersion > 0 && 'animate-reaction-burst-pop'
          )}
        >
          <Emoji emoji={myLastReaction.emoji} classNames={{ img: 'size-4', text: 'text-base' }} />
        </span>
      ) : (
        <Heart aria-hidden="true" />
      )}

      {displayBonusCount > 0 && (
        <span
          className={cn(
            'text-xs font-semibold transition-all duration-300',
            'text-primary',
            isBoostActive && 'opacity-100',
            !isBoostActive && !isReleasedBonusFading && 'opacity-100',
            !isBoostActive && isReleasedBonusFading && 'opacity-0'
          )}
          style={bonusIndicatorStyle}
        >
          +{displayBonusCount}
        </span>
      )}

      {!!likeCount && (
        <div
          className="text-sm ml-1"
          aria-label={`${likeCount} ${likeCount === 1 ? t('reaction') : t('reactions')}`}
        >
          {formatCount(likeCount)}
        </div>
      )}
    </button>
  )

  if (!reactionOptionsEnabled) {
    return trigger
  }

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer open={isEmojiReactionsOpen} onOpenChange={setIsEmojiReactionsOpen}>
          <DrawerOverlay onClick={() => setIsEmojiReactionsOpen(false)} />
          <DrawerContent hideOverlay>
            <Suspense fallback={<EmojiPickerFallback />}>
              <EmojiPicker
                showFavorites
                onEmojiClick={(emoji) => {
                  setIsEmojiReactionsOpen(false)
                  if (!emoji) return

                  like(emoji)
                }}
              />
            </Suspense>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu
      open={isEmojiReactionsOpen}
      onOpenChange={(open) => {
        setIsEmojiReactionsOpen(open)
        if (open) {
          setIsPickerOpen(false)
        }
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="p-0 w-fit">
        {isPickerOpen ? (
          <Suspense fallback={<EmojiPickerFallback />}>
            <EmojiPicker
              onEmojiClick={(emoji, e) => {
                e.stopPropagation()
                setIsEmojiReactionsOpen(false)
                if (!emoji) return

                like(emoji)
              }}
            />
          </Suspense>
        ) : (
          <SuggestedEmojis
            onEmojiClick={(emoji) => {
              setIsEmojiReactionsOpen(false)
              like(emoji)
            }}
            onMoreButtonClick={() => {
              setIsPickerOpen(true)
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
