import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import BackgroundAudio from '../BackgroundAudio'
import ExploreButton from './ExploreButton'
import HomeButton from './HomeButton'
import NotificationsButton from './NotificationsButton'
import AccountButton from './AccountButton'

export default function BottomNavigationBar() {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollYRef = useRef(0)
  const scrollDirectionRef = useRef<'up' | 'down'>('up')
  const scrollAccumulatorRef = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollDelta = currentScrollY - lastScrollYRef.current

      if (scrollDelta === 0) {
        return
      }

      const newDirection = scrollDelta > 0 ? 'down' : 'up'

      if (newDirection !== scrollDirectionRef.current) {
        scrollAccumulatorRef.current = 0
        scrollDirectionRef.current = newDirection
      }

      scrollAccumulatorRef.current += Math.abs(scrollDelta)

      if (currentScrollY < 50) {
        setIsVisible(true)
      } else if (newDirection === 'down' && scrollAccumulatorRef.current > 50) {
        setIsVisible(false)
        scrollAccumulatorRef.current = 0
      } else if (newDirection === 'up' && scrollAccumulatorRef.current > 30) {
        setIsVisible(true)
        scrollAccumulatorRef.current = 0
      }

      lastScrollYRef.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 w-full z-40 bg-background/80 backdrop-blur-xl transition-transform duration-300',
          'relative before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/15',
          isVisible ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: isVisible
            ? 'translateZ(0)'
            : 'translateY(calc(100% + env(safe-area-inset-bottom)))',
          WebkitTransform: isVisible
            ? 'translateZ(0)'
            : 'translateY(calc(100% + env(safe-area-inset-bottom)))',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          willChange: 'transform',
          position: 'fixed'
        }}
        aria-label="Bottom navigation"
      >
        <BackgroundAudio className="rounded-none border-x-0 border-t-0 border-b bg-transparent" />
        <div className="w-full flex justify-around items-center py-1.5 [&_svg]:size-4 [&_svg]:shrink-0">
          <HomeButton />
          <ExploreButton />
          <NotificationsButton />
          <AccountButton />
        </div>
      </nav>
    </>
  )
}
