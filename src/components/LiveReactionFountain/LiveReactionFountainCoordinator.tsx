import {
  getLiveReactionFountainBurstProgress,
  getLiveReactionFountainParticleCount,
  TLiveReactionFountainPayload,
  TLiveReactionFountainVisual
} from '@/lib/live-reaction-fountain'
import { LiveReactionFountainService } from '@/services/live-reaction-fountain.service'
import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { LiveReactionOverlayHost, TLiveReactionOverlayParticle } from './LiveReactionOverlayHost'

const MAX_CONCURRENT_PARTICLES = 18
const MIN_PARTICLE_DURATION_MS = 2_200
const PARTICLE_DURATION_RANGE_MS = 700
const HAPTIC_COOLDOWN_MS = 4_000
const MIN_BURST_WINDOW_MS = 110
const BURST_WINDOW_RANGE_MS = 320

const PREVIEW_BURSTS: Array<{ visual: TLiveReactionFountainVisual; bonusCount: number }> = [
  { visual: { kind: 'heart', emoji: '+' }, bonusCount: 6 },
  { visual: { kind: 'emoji', emoji: '😂' }, bonusCount: 0 },
  { visual: { kind: 'emoji', emoji: '🔥' }, bonusCount: 2 },
  { visual: { kind: 'emoji', emoji: '⚡' }, bonusCount: 4 },
  { visual: { kind: 'emoji', emoji: '🥲' }, bonusCount: 0 }
]

export type TLiveReactionFountainCoordinatorHandle = {
  previewBurst: () => void
}

export const LiveReactionFountainCoordinator = forwardRef<
  TLiveReactionFountainCoordinatorHandle,
  {
    service: LiveReactionFountainService
  }
>(function LiveReactionFountainCoordinator({ service }, ref) {
  const [particles, setParticles] = useState<TLiveReactionOverlayParticle[]>([])
  const pendingParticlesRef = useRef<TLiveReactionOverlayParticle[]>([])
  const enqueueParticleRef = useRef<(payload: TLiveReactionFountainPayload) => void>(() => {})
  const flushFrameRef = useRef<number | null>(null)
  const removalTimerMapRef = useRef<Map<string, number>>(new Map())
  const scheduledBurstTimerIdsRef = useRef<number[]>([])
  const previewTimerIdsRef = useRef<number[]>([])
  const lastHapticAtRef = useRef(0)

  useImperativeHandle(
    ref,
    () => ({
      previewBurst() {
        previewTimerIdsRef.current.forEach((timerId) => {
          window.clearTimeout(timerId)
        })
        previewTimerIdsRef.current = []

        PREVIEW_BURSTS.forEach(({ visual, bonusCount }, index) => {
          const timerId = window.setTimeout(() => {
            enqueueParticleRef.current({
              id: `preview-${Date.now()}-${index}`,
              authorPubkey: 'preview',
              createdAt: Math.floor(Date.now() / 1000),
              relayUrl: 'preview',
              bonusCount,
              visual
            })
          }, index * 130)
          previewTimerIdsRef.current.push(timerId)
        })
      }
    }),
    []
  )

  useEffect(() => {
    return service.subscribe((payload) => {
      enqueueParticleRef.current(payload)

      const now = Date.now()
      if (now - lastHapticAtRef.current >= HAPTIC_COOLDOWN_MS) {
        lastHapticAtRef.current = now
        triggerHaptic(10)
      }
    })
  }, [service])

  useEffect(() => {
    return () => {
      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current)
      }

      previewTimerIdsRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      scheduledBurstTimerIdsRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      scheduledBurstTimerIdsRef.current = []

      removalTimerMapRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      removalTimerMapRef.current.clear()
    }
  }, [])

  const enqueueParticle = (payload: TLiveReactionFountainPayload) => {
    const burstProgress = getLiveReactionFountainBurstProgress(payload.bonusCount)
    const particleCount = getLiveReactionFountainParticleCount(payload.bonusCount)
    const burstWindowMs =
      particleCount > 1
        ? MIN_BURST_WINDOW_MS + Math.round(burstProgress * BURST_WINDOW_RANGE_MS)
        : 0
    const spacingMs = particleCount > 1 ? burstWindowMs / Math.max(1, particleCount - 1) : 0

    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const particle = createOverlayParticle(
        payload.visual,
        `${payload.id}:${particleIndex}`,
        burstProgress,
        particleIndex,
        particleCount
      )
      const delayMs = Math.round(particleIndex * spacingMs)

      if (delayMs === 0) {
        mountParticle(particle)
        continue
      }

      const timerId = window.setTimeout(() => {
        scheduledBurstTimerIdsRef.current = scheduledBurstTimerIdsRef.current.filter(
          (currentTimerId) => currentTimerId !== timerId
        )
        mountParticle(particle)
      }, delayMs)

      scheduledBurstTimerIdsRef.current.push(timerId)
    }
  }
  enqueueParticleRef.current = enqueueParticle

  function mountParticle(particle: TLiveReactionOverlayParticle) {
    pendingParticlesRef.current.push(particle)

    const removalTimerId = window.setTimeout(() => {
      removalTimerMapRef.current.delete(particle.id)
      startTransition(() => {
        setParticles((currentParticles) =>
          currentParticles.filter((currentParticle) => currentParticle.id !== particle.id)
        )
      })
    }, particle.durationMs)

    removalTimerMapRef.current.set(particle.id, removalTimerId)

    if (flushFrameRef.current !== null) {
      return
    }

    flushFrameRef.current = window.requestAnimationFrame(() => {
      flushFrameRef.current = null
      const queuedParticles = pendingParticlesRef.current.splice(0)

      if (queuedParticles.length === 0) {
        return
      }

      startTransition(() => {
        setParticles((currentParticles) => {
          const nextParticles = currentParticles.concat(queuedParticles)
          const overflowCount = Math.max(0, nextParticles.length - MAX_CONCURRENT_PARTICLES)
          if (overflowCount > 0) {
            nextParticles.slice(0, overflowCount).forEach((particleToDrop) => {
              const removalTimerId = removalTimerMapRef.current.get(particleToDrop.id)
              if (removalTimerId !== undefined) {
                window.clearTimeout(removalTimerId)
                removalTimerMapRef.current.delete(particleToDrop.id)
              }
            })
          }
          return nextParticles.slice(overflowCount)
        })
      })
    })
  }

  return <LiveReactionOverlayHost particles={particles} />
})

function createOverlayParticle(
  visual: TLiveReactionFountainVisual,
  id: string,
  burstProgress: number,
  particleIndex: number,
  particleCount: number
): TLiveReactionOverlayParticle {
  const burstSpread = particleCount > 1 ? particleIndex / Math.max(1, particleCount - 1) - 0.5 : 0

  return {
    id,
    visual,
    durationMs:
      MIN_PARTICLE_DURATION_MS +
      Math.round(Math.random() * PARTICLE_DURATION_RANGE_MS) -
      Math.round(burstProgress * 220),
    risePx: 180 + Math.round(Math.random() * 120) + Math.round(burstProgress * 55),
    swayPx:
      -36 + Math.round(Math.random() * 72) + Math.round(burstSpread * (48 + burstProgress * 44)),
    startOffsetPx: -18 + Math.round(Math.random() * 28) + Math.round(burstSpread * 26),
    startRotationDeg: -10 + Math.round(Math.random() * 20),
    endRotationDeg:
      -22 + Math.round(Math.random() * 44) + Math.round(burstSpread * (10 + burstProgress * 18)),
    scale: 0.92 + Math.random() * 0.38 + burstProgress * 0.18
  }
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }

  navigator.vibrate(pattern)
}
