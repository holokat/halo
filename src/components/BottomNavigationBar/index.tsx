import { useDynamicScrollBlur } from '@/hooks/useDynamicScrollBlur'
import { floatingGlassBackdropStyle, floatingGlassSurfaceClassName } from '@/lib/floating-glass'
import { cn } from '@/lib/utils'
import { useOptionalScrollVisibility } from '@/providers/ScrollVisibilityProvider'
import BackgroundAudio from '../BackgroundAudio'
import AccountButton from './AccountButton'
import ComposeButton from './ComposeButton'
import ExploreButton from './ExploreButton'
import HomeButton from './HomeButton'
import NotificationsButton from './NotificationsButton'

export default function BottomNavigationBar() {
  const scrollVisibility = useOptionalScrollVisibility()
  const isVisible = scrollVisibility?.isVisible ?? true
  const navRef = useDynamicScrollBlur<HTMLElement>({ restBlur: 12, minBlur: 4 })

  return (
    <>
      <BackgroundAudio className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-4 right-4 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border border-foreground/10 bg-background/80 shadow-lg backdrop-blur-md" />
      <nav
        ref={navRef}
        className={cn(
          floatingGlassSurfaceClassName,
          'fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-[1.75rem] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
          !isVisible &&
            'pointer-events-none translate-y-[calc(100%+env(safe-area-inset-bottom)+0.75rem)] opacity-0'
        )}
        style={floatingGlassBackdropStyle}
        aria-label="Bottom navigation"
      >
        <div className="relative z-10 flex items-center gap-1 p-1.5">
          <HomeButton />
          <ExploreButton />
          <ComposeButton className="order-last md:order-none" />
          <NotificationsButton />
          <AccountButton />
        </div>
      </nav>
    </>
  )
}
