import Icon from '@/assets/Icon'
import Logo from '@/assets/Logo'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePrimaryPage } from '@/PageManager'
import AccountButton from './AccountButton'
import SearchButton from './ExploreButton'
import HomeButton from './HomeButton'
import NotificationsButton from './NotificationButton'
import PostButton from './PostButton'
import ProfileButton from './ProfileButton'

export default function PrimaryPageSidebar() {
  const { navigate } = usePrimaryPage()

  return (
    <TooltipProvider>
      <nav
        className="flex h-full w-16 shrink-0 flex-col px-2 pb-3 pt-4 xl:w-52 xl:px-4"
        aria-label="Primary navigation"
      >
        <button
          type="button"
          className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-transparent p-0 xl:w-full xl:justify-start xl:px-3"
          onClick={() => navigate('home')}
          aria-label="Home"
        >
          <Icon className="xl:hidden" />
          <Logo className="hidden max-h-8 max-w-[8rem] xl:block" />
        </button>

        <div className="space-y-1">
          <HomeButton />
          <SearchButton />
          <NotificationsButton />
          <ProfileButton />
          <PostButton />
        </div>

        <div className="mt-auto pt-6">
          <AccountButton />
        </div>
      </nav>
    </TooltipProvider>
  )
}
