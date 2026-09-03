import { usePrimaryPage, useSecondaryPage } from '@/PageManager'
import { toProfile, toSettings } from '@/lib/link'
import { formatNpub, pubkeyToNpub } from '@/lib/pubkey'
import { useMenuItems } from '@/providers/MenuItemsProvider'
import { useNostr } from '@/providers/NostrProvider'
import NpubQrCode from '@/components/NpubQrCode'
import LoginDialog from '@/components/LoginDialog'
import LogoutDialog from '@/components/LogoutDialog'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { bottomNavigationItemClassName } from '@/components/BottomNavigationBar/BottomNavigationBarItem'
import { cn } from '@/lib/utils'
import {
  ArrowDownUp,
  Bell,
  BookOpen,
  Check,
  Copy,
  Home,
  KeyRound,
  List,
  LogOut,
  QrCode as QrCodeIcon,
  Radio,
  Search,
  Settings,
  UserRound
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type TMobileMenuItem = {
  id: 'home' | 'reads' | 'lists' | 'explore' | 'notifications' | 'livestreams'
  label: string
  icon: React.ComponentType<{ className?: string }>
  page: 'home' | 'reads' | 'lists' | 'explore' | 'notifications' | 'livestreams'
  requiresLogin?: boolean
}

export default function MobileTopNavMenuButton({
  variant = 'titlebar',
  active = false
}: {
  variant?: 'titlebar' | 'bottom-navigation'
  active?: boolean
}) {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const [open, setOpen] = useState(false)
  const isBottomNavigation = variant === 'bottom-navigation'

  return (
    <>
      <Button
        variant="ghost"
        size={isBottomNavigation ? undefined : 'titlebar-icon'}
        className={cn(
          'rounded-full p-0',
          isBottomNavigation && bottomNavigationItemClassName(active)
        )}
        onClick={() => setOpen(true)}
        aria-label={t('Account')}
        aria-current={active ? 'page' : undefined}
      >
        {pubkey ? (
          <SimpleUserAvatar userId={pubkey} size="small" />
        ) : (
          <UserRound className="size-5 text-muted-foreground" />
        )}
      </Button>
      <MobileNavSheet open={open} onOpenChange={setOpen} accountOnly={isBottomNavigation} />
    </>
  )
}

function MobileNavSheet({
  open,
  onOpenChange,
  accountOnly = false
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountOnly?: boolean
}) {
  const { t } = useTranslation()
  const { menuItems } = useMenuItems()
  const { pubkey, profile, checkLogin } = useNostr()
  const { navigate, current } = usePrimaryPage()
  const { push } = useSecondaryPage()
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [npubCopied, setNpubCopied] = useState(false)
  const npub = useMemo(() => (pubkey ? pubkeyToNpub(pubkey) : null), [pubkey])
  const inviteLink = useMemo(() => {
    if (!npub) return ''
    return `${window.location.origin}?invite=${npub}`
  }, [npub])
  const displayName = useMemo(
    () =>
      profile?.original_username || profile?.username || (npub ? formatNpub(npub, 22) : t('Login')),
    [profile?.original_username, profile?.username, npub, t]
  )

  const closeThen = useMemo(
    () => (action: () => void) => {
      onOpenChange(false)
      window.setTimeout(action, 0)
    },
    [onOpenChange]
  )

  const menuDefinitions = useMemo<Record<TMobileMenuItem['id'], TMobileMenuItem>>(
    () => ({
      home: { id: 'home', label: t('Home'), icon: Home, page: 'home' },
      explore: { id: 'explore', label: t('Search'), icon: Search, page: 'explore' },
      notifications: {
        id: 'notifications',
        label: t('Notifications'),
        icon: Bell,
        page: 'notifications',
        requiresLogin: true
      },
      reads: { id: 'reads', label: t('Reads'), icon: BookOpen, page: 'reads' },
      lists: { id: 'lists', label: t('Lists'), icon: List, page: 'lists' },
      livestreams: {
        id: 'livestreams',
        label: t('Live Streams'),
        icon: Radio,
        page: 'livestreams'
      }
    }),
    [t]
  )

  const visibleItems = useMemo(() => {
    return menuItems
      .filter(
        (item) =>
          item.visible &&
          item.canReorder &&
          item.id !== 'post' &&
          item.id !== 'lists' &&
          item.id !== 'livestreams'
      )
      .sort((a, b) => a.order - b.order)
      .map((item) => menuDefinitions[item.id as TMobileMenuItem['id']])
      .filter(Boolean)
  }, [menuItems, menuDefinitions])

  const handleProfilePress = () => {
    if (!pubkey) {
      closeThen(() => {
        void checkLogin()
      })
      return
    }
    closeThen(() => push(toProfile(pubkey)))
  }

  const handleCopy = async (
    text: string,
    successMessage: string,
    setCopiedState: (value: boolean) => void
  ) => {
    if (!text) return

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        if (!successful) {
          throw new Error('Copy command was unsuccessful')
        }
      }

      setCopiedState(true)
      toast.success(successMessage)
      window.setTimeout(() => setCopiedState(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error(t('Failed to copy'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={accountOnly ? 'bottom' : 'left'}
        hideClose
        className={cn(
          'p-0',
          accountOnly
            ? 'mx-auto max-h-[82vh] w-full max-w-md rounded-t-[2rem] border-x border-t'
            : 'w-[82vw] max-w-[22rem]'
        )}
      >
        <div
          className={cn(
            'overflow-y-auto py-3',
            accountOnly ? 'max-h-[82vh] pb-[calc(env(safe-area-inset-bottom)+1rem)]' : 'h-full'
          )}
        >
          {pubkey && npub ? (
            <div className="px-4 pb-3">
              <button
                type="button"
                className="mb-3 flex w-full items-center gap-3 text-left"
                onClick={handleProfilePress}
              >
                <SimpleUserAvatar userId={pubkey} size="big" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-tight">
                    {displayName}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-3">
                <Button
                  className="h-10 rounded-full px-4 text-sm font-semibold"
                  onClick={() =>
                    void handleCopy(
                      inviteLink,
                      t('Invite link copied to clipboard!'),
                      setInviteCopied
                    )
                  }
                >
                  {inviteCopied ? (
                    <Check className="size-[1.125rem]" />
                  ) : (
                    <Copy className="size-[1.125rem]" />
                  )}
                  {inviteCopied ? t('Copied!') : t('Copy Invite Link')}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => setQrDialogOpen(true)}
                >
                  <QrCodeIcon className="size-[1.125rem]" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() =>
                    void handleCopy(npub, t('Public key copied to clipboard!'), setNpubCopied)
                  }
                  aria-label={t('Copy npub')}
                >
                  {npubCopied ? (
                    <Check className="size-[1.125rem]" />
                  ) : (
                    <KeyRound className="size-[1.125rem]" />
                  )}
                </Button>
              </div>

              <NpubQrCode
                pubkey={pubkey}
                variant="dialog"
                open={qrDialogOpen}
                setOpen={setQrDialogOpen}
              />
            </div>
          ) : (
            <div className="px-4 pb-3">
              <button
                type="button"
                className="mb-3 flex w-full items-center gap-3 text-left"
                onClick={handleProfilePress}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-7" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-tight">{t('Login')}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {t('Sign in to your account')}
                  </div>
                </div>
              </button>
              <Button
                className="h-10 rounded-full px-4 text-sm font-semibold"
                onClick={handleProfilePress}
              >
                {t('Login')}
              </Button>
            </div>
          )}

          {!accountOnly && (
            <>
              <div className="my-2 h-px bg-border" />

              <div className="px-2">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const itemIsActive = current === item.page
                  return (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className="mb-0.5 h-11 w-full justify-start gap-3 px-3 text-[15px] font-medium [&_svg]:size-5"
                      onClick={() => {
                        if (item.requiresLogin) {
                          closeThen(() => {
                            void checkLogin(() => navigate(item.page))
                          })
                          return
                        }
                        closeThen(() => navigate(item.page))
                      }}
                    >
                      <Icon
                        className={itemIsActive ? 'text-foreground' : 'text-muted-foreground'}
                      />
                      <span className={itemIsActive ? 'font-semibold text-foreground' : ''}>
                        {item.label}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </>
          )}

          <div className="my-2 h-px bg-border" />

          <div className="px-2">
            <Button
              variant="ghost"
              className="h-11 w-full justify-start gap-3 px-3 text-[15px] font-medium [&_svg]:size-5"
              onClick={() => closeThen(() => push(toSettings()))}
            >
              <Settings className="text-muted-foreground" />
              {t('Settings')}
            </Button>
          </div>

          {pubkey && (
            <>
              <div className="my-2 h-px bg-border" />

              <div className="px-2">
                <Button
                  variant="ghost"
                  className="mb-0.5 h-11 w-full justify-start gap-3 px-3 text-[15px] font-medium [&_svg]:size-5"
                  onClick={handleProfilePress}
                >
                  <UserRound className="text-muted-foreground" />
                  {t('View profile', { defaultValue: 'View profile' })}
                </Button>
                <Button
                  variant="ghost"
                  className="mb-0.5 h-11 w-full justify-start gap-3 px-3 text-[15px] font-medium [&_svg]:size-5"
                  onClick={() => closeThen(() => setLoginDialogOpen(true))}
                >
                  <ArrowDownUp className="text-muted-foreground" />
                  {t('Switch account')}
                </Button>
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start gap-3 px-3 text-[15px] font-medium text-destructive hover:text-destructive [&_svg]:size-5"
                  onClick={() => closeThen(() => setLogoutDialogOpen(true))}
                >
                  <LogOut />
                  {t('Logout')}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
      <LoginDialog open={loginDialogOpen} setOpen={setLoginDialogOpen} />
      <LogoutDialog open={logoutDialogOpen} setOpen={setLogoutDialogOpen} />
    </Sheet>
  )
}
