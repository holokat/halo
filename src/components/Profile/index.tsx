import Collapsible from '@/components/Collapsible'
import FollowButton from '@/components/FollowButton'
import InvitedBy from '@/components/InvitedBy'
import NpubQrCode from '@/components/NpubQrCode'
import PrivateNote from '@/components/PrivateNote'
import ProfileAbout from '@/components/ProfileAbout'
import ProfileBanner from '@/components/ProfileBanner'
import ProfileOptions from '@/components/ProfileOptions'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchFollowings, useFetchProfile } from '@/hooks'
import useModalRegistration from '@/hooks/useModalRegistration'
import { toMuteList } from '@/lib/link'
import { generateImageByPubkey } from '@/lib/pubkey'
import { randomString } from '@/lib/random'
import { cn } from '@/lib/utils'
import { SecondaryPageLink } from '@/PageManager'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import client from '@/services/client.service'
import { BellOff, Link } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import NotFound from '../NotFound'
import ProfileGallery from '../ProfileGallery'
import FollowedBy from './FollowedBy'
import Followings from './Followings'
import ProfileFeed from './ProfileFeed'

export default function Profile({
  id,
  isInDeckView = false
}: {
  id?: string
  isInDeckView?: boolean
}) {
  const { t } = useTranslation()
  const { profile, isFetching } = useFetchProfile(id)
  const { pubkey: accountPubkey } = useNostr()
  const { isSmallScreen } = useScreenSize()
  const { mutePubkeySet } = useMuteList()
  const { followings } = useFetchFollowings(profile?.pubkey)
  const isFollowingYou = useMemo(() => {
    return (
      !!accountPubkey && accountPubkey !== profile?.pubkey && followings.includes(accountPubkey)
    )
  }, [followings, profile, accountPubkey])
  const defaultImage = useMemo(
    () => (profile?.pubkey ? generateImageByPubkey(profile?.pubkey) : ''),
    [profile]
  )
  const [topContainerHeight, setTopContainerHeight] = useState(0)
  const isSelf = accountPubkey === profile?.pubkey
  const [topContainer, setTopContainer] = useState<HTMLDivElement | null>(null)
  const topContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setTopContainer(node)
    }
  }, [])
  const avatarLightboxId = useMemo(() => `profile-avatar-lightbox-${randomString()}`, [])
  const [avatarLightboxIndex, setAvatarLightboxIndex] = useState(-1)
  const bannerLightboxId = useMemo(() => `profile-banner-lightbox-${randomString()}`, [])
  const [bannerLightboxIndex, setBannerLightboxIndex] = useState(-1)
  const bannerBorderRadius = isSmallScreen ? 'var(--media-radius, 14px)' : '0px'
  const bannerClassName = 'w-full aspect-[12/5]'

  useEffect(() => {
    if (!profile?.pubkey) return

    const forceUpdateCache = async () => {
      await Promise.all([
        client.forceUpdateRelayListEvent(profile.pubkey),
        client.fetchProfile(profile.pubkey, true)
      ])
    }
    forceUpdateCache()
  }, [profile?.pubkey])

  useEffect(() => {
    if (!topContainer) return

    const checkHeight = () => {
      setTopContainerHeight(topContainer.scrollHeight)
    }

    checkHeight()

    const observer = new ResizeObserver(() => {
      checkHeight()
    })

    observer.observe(topContainer)

    return () => {
      observer.disconnect()
    }
  }, [topContainer])

  useModalRegistration(avatarLightboxId, avatarLightboxIndex >= 0, () => {
    setAvatarLightboxIndex(-1)
  })

  useModalRegistration(bannerLightboxId, bannerLightboxIndex >= 0, () => {
    setBannerLightboxIndex(-1)
  })

  const isMutedProfile = useMemo(
    () => !!profile?.pubkey && !isSelf && mutePubkeySet.has(profile.pubkey),
    [isSelf, mutePubkeySet, profile?.pubkey]
  )

  if (!profile && isFetching) {
    return (
      <>
        <div>
          <div className="relative mb-2">
            <div
              className="relative overflow-hidden bg-muted/30"
              style={{ borderRadius: bannerBorderRadius }}
            >
              <Skeleton className={bannerClassName} style={{ borderRadius: bannerBorderRadius }} />
            </div>
            <Skeleton className="w-24 h-24 absolute bottom-0 left-3 translate-y-1/2 border-4 border-background rounded-full" />
          </div>
        </div>
        <div className="relative -mt-10 pt-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent via-background/80 to-background" />
          <div className="relative px-4">
            <Skeleton className="h-5 w-28 mt-14 mb-1" />
            <Skeleton className="h-5 w-56 mt-2 my-1 rounded-full" />
          </div>
        </div>
      </>
    )
  }
  if (!profile) return <NotFound />

  const { banner, username, about, avatar, pubkey, website, gallery } = profile

  const handleAvatarClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (avatar) {
      setAvatarLightboxIndex(0)
    }
  }

  const handleBannerClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (banner) {
      setBannerLightboxIndex(0)
    }
  }

  return (
    <>
      <div ref={topContainerRef}>
        <div className="relative mb-2">
          <div
            className="relative overflow-hidden bg-muted/30"
            style={{ borderRadius: bannerBorderRadius }}
          >
            <ProfileBanner
              banner={banner}
              pubkey={pubkey}
              className={cn(
                bannerClassName,
                banner && 'cursor-pointer hover:opacity-90 transition-opacity'
              )}
              borderRadius={bannerBorderRadius}
              onClick={handleBannerClick}
              isLCP={true}
            />
          </div>
          <Avatar
            className="z-20 w-24 h-24 absolute left-3 bottom-0 translate-y-1/2 border-4 border-background cursor-pointer hover:opacity-90 transition-opacity"
            onClick={handleAvatarClick}
          >
            <AvatarImage src={avatar} className="object-cover object-center" />
            <AvatarFallback>
              <img src={defaultImage} />
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="relative -mt-10 pt-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 bg-gradient-to-b from-transparent via-background/80 to-background" />
          <div className="relative z-10 px-4">
            <div className="flex justify-end h-8 gap-2 items-center">
              {isSelf ? (
                <>
                  <ProfileOptions pubkey={pubkey} />
                  <NpubQrCode pubkey={pubkey} variant="button" />
                </>
              ) : (
                <>
                  {isMutedProfile && (
                    <div
                      className="flex size-8 items-center justify-center rounded-full border text-muted-foreground"
                      title={t('Muted')}
                      aria-label={t('Muted')}
                    >
                      <BellOff className="size-4" />
                    </div>
                  )}
                  <ProfileOptions pubkey={pubkey} />
                  <FollowButton pubkey={pubkey} />
                </>
              )}
            </div>
            <div className="pt-2">
              {!isSelf && <PrivateNote pubkey={pubkey} />}
              <div className="flex gap-2 items-center">
                <div className="text-xl font-semibold truncate select-text">{username}</div>
                {isFollowingYou && (
                  <div className="text-muted-foreground rounded-full bg-muted text-xs h-fit px-2 shrink-0">
                    {t('Follows you')}
                  </div>
                )}
              </div>
              <InvitedBy pubkey={pubkey} />
              <Collapsible>
                <ProfileAbout
                  about={about}
                  className="text-wrap break-words whitespace-pre-wrap mt-2 select-text"
                />
              </Collapsible>
              {website && (
                <div className="flex gap-1 items-center text-primary mt-2 truncate select-text">
                  <Link size={14} className="shrink-0" />
                  <a
                    href={website}
                    target="_blank"
                    className="hover:underline truncate flex-1 max-w-fit w-0"
                  >
                    {website}
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center mt-2 text-sm">
                <div className="flex gap-4 items-center">
                  <Followings pubkey={pubkey} />
                  {isSelf && (
                    <SecondaryPageLink
                      to={toMuteList()}
                      className="flex gap-1 hover:underline w-fit"
                    >
                      {mutePubkeySet.size}
                      <div className="text-muted-foreground">{t('Muted')}</div>
                    </SecondaryPageLink>
                  )}
                </div>
                {!isSelf && <FollowedBy pubkey={pubkey} />}
              </div>
              <ProfileGallery pubkey={pubkey} gallery={gallery} maxImages={8} />
            </div>
          </div>
        </div>
      </div>
      <ProfileFeed
        pubkey={pubkey}
        topSpace={topContainerHeight + 100}
        isInDeckView={isInDeckView}
      />
      {avatarLightboxIndex >= 0 &&
        avatar &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <Lightbox
              index={avatarLightboxIndex}
              slides={[{ src: avatar }]}
              plugins={[Zoom]}
              open={avatarLightboxIndex >= 0}
              close={() => setAvatarLightboxIndex(-1)}
              controller={{
                closeOnBackdropClick: true,
                closeOnPullUp: true,
                closeOnPullDown: true
              }}
              styles={{
                toolbar: { paddingTop: '2.25rem' }
              }}
            />
          </div>,
          document.body
        )}
      {bannerLightboxIndex >= 0 &&
        banner &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <Lightbox
              index={bannerLightboxIndex}
              slides={[{ src: banner }]}
              plugins={[Zoom]}
              open={bannerLightboxIndex >= 0}
              close={() => setBannerLightboxIndex(-1)}
              controller={{
                closeOnBackdropClick: true,
                closeOnPullUp: true,
                closeOnPullDown: true
              }}
              styles={{
                toolbar: { paddingTop: '2.25rem' }
              }}
            />
          </div>,
          document.body
        )}
    </>
  )
}
