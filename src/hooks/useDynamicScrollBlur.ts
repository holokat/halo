import { useEffect, useRef } from 'react'

type DynamicScrollBlurOptions = {
  restBlur?: number
  minBlur?: number
  velocityMax?: number
  idleDelay?: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

export function useDynamicScrollBlur<TElement extends HTMLElement>({
  restBlur = 16,
  minBlur = 4,
  velocityMax = 2,
  idleDelay = 120
}: DynamicScrollBlurOptions = {}) {
  const ref = useRef<TElement | null>(null)

  useEffect(() => {
    const target = ref.current
    if (!target) return

    const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
    if (reducedTransparency.matches) return

    let lastScrollY = window.scrollY
    let lastTime = performance.now()
    let animationFrame = 0
    let idleTimer = 0
    let pendingBlur = restBlur

    const writeBlur = () => {
      animationFrame = 0
      target.style.setProperty('--scroll-blur-current', `${pendingBlur.toFixed(2)}px`)
    }

    const scheduleWrite = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(writeBlur)
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const now = performance.now()
      const velocity = Math.abs(currentScrollY - lastScrollY) / Math.max(16, now - lastTime)

      pendingBlur = lerp(restBlur, minBlur, clamp(velocity / velocityMax))
      lastScrollY = currentScrollY
      lastTime = now
      scheduleWrite()

      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        pendingBlur = restBlur
        scheduleWrite()
      }, idleDelay)
    }

    target.style.setProperty('--scroll-blur-current', `${restBlur}px`)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.clearTimeout(idleTimer)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      target.style.removeProperty('--scroll-blur-current')
    }
  }, [idleDelay, minBlur, restBlur, velocityMax])

  return ref
}
