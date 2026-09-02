import AccountManager from '@/components/AccountManager'
import LoginDialog from '@/components/LoginDialog'
import LogoutDialog from '@/components/LogoutDialog'
import PubkeyCopy from '@/components/PubkeyCopy'
import NpubQrCode from '@/components/NpubQrCode'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { SimpleUsername } from '@/components/Username'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { toProfile, toSettings } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'

import { pubkeyToNpub } from '@/lib/pubkey'
import { toast } from 'sonner'
import {
  ArrowDownUp,
  ChevronRight,
  LogOut,
  Settings,
  UserRound,
  QrCode as QrCodeIcon,
  UserPlus
} from 'lucide-react'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  useMemo,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'

const MePage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { pubkey } = useNostr()
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)

  const inviteLink = useMemo(() => {
    if (!pubkey) return ''
    const npub = pubkeyToNpub(pubkey)
    if (!npub) return ''
    return `${window.location.origin}?invite=${npub}`
  }, [pubkey])

  const handleCopyInvite = async () => {
    if (!inviteLink) return

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteLink)
        setInviteCopied(true)
        toast.success(
          t('Invite link copied to clipboard!', {
            defaultValue: 'Invite link copied to clipboard!'
          })
        )
        setTimeout(() => setInviteCopied(false), 2000)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = inviteLink
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()

        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)

        if (successful) {
          setInviteCopied(true)
          toast.success(
            t('Invite link copied to clipboard!', {
              defaultValue: 'Invite link copied to clipboard!'
            })
          )
          setTimeout(() => setInviteCopied(false), 2000)
        } else {
          throw new Error('Copy command was unsuccessful')
        }
      }
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error(
        t('Failed to copy invite link', {
          defaultValue: 'Failed to copy invite link'
        })
      )
    }
  }

  if (!pubkey) {
    return (
      <PrimaryPageLayout
        ref={ref}
        pageName="me"
        titlebar={<MePageTitlebar />}
        hideTitlebarBottomBorder
      >
        <div className="flex flex-col p-4 gap-4 overflow-auto">
          <AccountManager />
        </div>
      </PrimaryPageLayout>
    )
  }

  return (
    <PrimaryPageLayout
      ref={ref}
      pageName="me"
      titlebar={<MePageTitlebar />}
      hideTitlebarBottomBorder
    >
      <div className="flex gap-4 items-center px-4 pt-2 pb-3">
        <SimpleUserAvatar userId={pubkey} size="big" />
        <div className="space-y-1 flex-1 w-0">
          <SimpleUsername
            className="text-xl font-semibold text-wrap"
            userId={pubkey}
            skeletonClassName="h-6 w-32"
          />
          <div className="mt-1 flex items-center gap-2">
            <PubkeyCopy pubkey={pubkey} />
            <Button
              variant="secondary"
              size="icon"
              className="size-10 rounded-full"
              onClick={() => setQrDialogOpen(true)}
              aria-label={t('Show public key QR code', {
                defaultValue: 'Show public key QR code'
              })}
              title={t('Show public key QR code', {
                defaultValue: 'Show public key QR code'
              })}
            >
              <QrCodeIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <Button
          variant="default"
          className="w-fit gap-2 px-3"
          onClick={handleCopyInvite}
          disabled={!inviteLink}
        >
          <UserPlus className="h-4 w-4" />
          {inviteCopied
            ? t('Copied!')
            : t('Copy invite link', { defaultValue: 'Copy invite link' })}
        </Button>
      </div>

      <div className="mt-1">
        <Item onClick={() => push(toProfile(pubkey))}>
          <UserRound />
          {t('Profile')}
        </Item>
        <Item onClick={() => push(toSettings())}>
          <Settings />
          {t('Settings')}
        </Item>
        <Item onClick={() => setLoginDialogOpen(true)}>
          <ArrowDownUp /> {t('Switch account')}
        </Item>
        <Separator className="bg-background" />
        <Item
          className="text-destructive focus:text-destructive"
          onClick={() => setLogoutDialogOpen(true)}
          hideChevron
        >
          <LogOut />
          {t('Logout')}
        </Item>
      </div>
      <LoginDialog open={loginDialogOpen} setOpen={setLoginDialogOpen} />
      <LogoutDialog open={logoutDialogOpen} setOpen={setLogoutDialogOpen} />
      <NpubQrCode pubkey={pubkey} variant="dialog" open={qrDialogOpen} setOpen={setQrDialogOpen} />
    </PrimaryPageLayout>
  )
})
MePage.displayName = 'MePage'
export default MePage

function MePageTitlebar() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full items-center px-3">
      <div className="text-lg font-semibold" style={{ fontSize: 'var(--title-font-size, 18px)' }}>
        {t('Account')}
      </div>
    </div>
  )
}

function Item({
  children,
  className,
  hideChevron = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  hideChevron?: boolean
}) {
  const childArray = Array.isArray(children) ? children : [children]
  const icon = childArray[0]
  const label = childArray.slice(1)

  return (
    <button
      type="button"
      className={cn(
        'flex h-[52px] w-full items-center justify-between rounded-lg px-4 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center [&_svg]:size-4 [&_svg]:shrink-0">
          {icon}
        </div>
        <span>{label}</span>
      </div>
      {!hideChevron && <ChevronRight className="size-4 shrink-0" />}
    </button>
  )
}
