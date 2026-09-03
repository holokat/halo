import BackgroundAudio from '../BackgroundAudio'
import AccountButton from './AccountButton'
import ExploreButton from './ExploreButton'
import HomeButton from './HomeButton'
import NotificationsButton from './NotificationsButton'

export default function BottomNavigationBar() {
  return (
    <>
      <BackgroundAudio className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-4 right-4 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border border-foreground/10 bg-background/80 shadow-lg backdrop-blur-md" />
      <nav
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-background/80 shadow-[0_18px_48px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.14)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/[0.10] before:via-transparent before:to-black/[0.04] supports-[backdrop-filter]:bg-background/65 dark:before:from-white/[0.08] dark:before:to-black/[0.12]"
        style={{
          WebkitBackdropFilter: 'blur(12px) saturate(160%)',
          backdropFilter: 'blur(12px) saturate(160%)'
        }}
        aria-label="Bottom navigation"
      >
        <div className="relative z-10 flex items-center gap-1 p-1.5">
          <HomeButton />
          <ExploreButton />
          <NotificationsButton />
          <AccountButton />
        </div>
      </nav>
    </>
  )
}
