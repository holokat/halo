import LoginDialog from '@/components/LoginDialog'
import client from '@/services/client.service'
import customEmojiService from '@/services/custom-emoji.service'
import storage from '@/services/local-storage.service'
import { TAccountPointer, TDraftEvent, TProfile, TPublishOptions, TRelayList, ISigner } from '@/types'
import { Event, VerifiedEvent } from 'nostr-tools'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeletedEvent } from '../DeletedEventProvider'
import { createNostrActions } from './actions'
import { useScheduledPostsProcessor } from './scheduled-posts'

type TNostrContext = {
  isInitialized: boolean
  pubkey: string | null
  profile: TProfile | null
  profileEvent: Event | null
  relayList: TRelayList | null
  inboxRelayUrls: string[]
  nip44Supported: boolean
  followListEvent: Event | null
  muteListEvent: Event | null
  bookmarkListEvent: Event | null
  favoriteRelaysEvent: Event | null
  userEmojiListEvent: Event | null
  pinListEvent: Event | null
  notificationsSeenAt: number
  account: TAccountPointer | null
  accounts: TAccountPointer[]
  nsec: string | null
  ncryptsec: string | null
  switchAccount: (account: TAccountPointer | null) => Promise<void>
  nsecLogin: (nsec: string, password?: string, needSetup?: boolean) => Promise<string>
  ncryptsecLogin: (ncryptsec: string) => Promise<string>
  nip07Login: () => Promise<string>
  bunkerLogin: (bunker: string) => Promise<string>
  nostrConnectionLogin: (clientSecretKey: Uint8Array, connectionString: string) => Promise<string>
  npubLogin(npub: string): Promise<string>
  removeAccount: (account: TAccountPointer) => void
  /**
   * Default publish the event to current relays, user's write relays and additional relays
   */
  publish: (draftEvent: TDraftEvent, options?: TPublishOptions) => Promise<Event>
  attemptDelete: (targetEvent: Event) => Promise<void>
  signHttpAuth: (url: string, method: string) => Promise<string>
  signEvent: (draftEvent: TDraftEvent) => Promise<VerifiedEvent>
  nip04Encrypt: (pubkey: string, plainText: string) => Promise<string>
  nip04Decrypt: (pubkey: string, cipherText: string) => Promise<string>
  nip44Encrypt: (pubkey: string, plainText: string) => Promise<string>
  nip44Decrypt: (pubkey: string, cipherText: string) => Promise<string>
  startLogin: () => void
  checkLogin: <T>(cb?: () => T) => Promise<T | void>
  updateRelayListEvent: (relayListEvent: Event) => Promise<void>
  updateInboxRelayEvent: (inboxRelayEvent: Event) => Promise<void>
  updateProfileEvent: (profileEvent: Event) => Promise<void>
  updateFollowListEvent: (followListEvent: Event) => Promise<void>
  updateMuteListEvent: (muteListEvent: Event, privateTags: string[][]) => Promise<void>
  updateBookmarkListEvent: (bookmarkListEvent: Event) => Promise<void>
  updateFavoriteRelaysEvent: (favoriteRelaysEvent: Event) => Promise<void>
  updatePinListEvent: (pinListEvent: Event) => Promise<void>
  updateNotificationsSeenAt: (skipPublish?: boolean) => Promise<void>
}

const NostrContext = createContext<TNostrContext | undefined>(undefined)
const lastPublishedSeenNotificationsAtEventAtMap = new Map<string, number>()

export const useNostr = () => {
  const context = useContext(NostrContext)
  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider')
  }
  return context
}

export const useOptionalNostr = () => {
  return useContext(NostrContext)
}

export function NostrProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { addDeletedEvent } = useDeletedEvent()
  const initialAccounts = storage.getAccounts().map((act) => ({
    pubkey: act.pubkey,
    signerType: act.signerType
  }))

  const [accounts, setAccounts] = useState<TAccountPointer[]>(initialAccounts)
  const [account, setAccount] = useState<TAccountPointer | null>(null)
  const [nsec, setNsec] = useState<string | null>(null)
  const [ncryptsec, setNcryptsec] = useState<string | null>(null)
  const [signer, setSigner] = useState<ISigner | null>(null)
  const [openLoginDialog, setOpenLoginDialog] = useState(false)
  const [profile, setProfile] = useState<TProfile | null>(null)
  const [profileEvent, setProfileEvent] = useState<Event | null>(null)
  const [relayList, setRelayList] = useState<TRelayList | null>(null)
  const [inboxRelayUrls, setInboxRelayUrls] = useState<string[]>([])
  const [followListEvent, setFollowListEvent] = useState<Event | null>(null)
  const [muteListEvent, setMuteListEvent] = useState<Event | null>(null)
  const [bookmarkListEvent, setBookmarkListEvent] = useState<Event | null>(null)
  const [favoriteRelaysEvent, setFavoriteRelaysEvent] = useState<Event | null>(null)
  const [userEmojiListEvent, setUserEmojiListEvent] = useState<Event | null>(null)
  const [pinListEvent, setPinListEvent] = useState<Event | null>(null)
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(-1)
  const [isInitialized, setIsInitialized] = useState(false)
  const [nip44Supported, setNip44Supported] = useState(false)

  const activeAccountRef = useRef<TAccountPointer | null>(null)
  const signerRef = useRef<ISigner | null>(null)
  const profileRef = useRef<TProfile | null>(null)
  const accountsRef = useRef<TAccountPointer[]>(initialAccounts)
  const tRef = useRef(t)
  const scheduledPostProcessingIdsRef = useRef<Set<string>>(new Set())
  const scheduledPostFailureToastAtRef = useRef<Map<string, number>>(new Map())
  const actionsRef = useRef<ReturnType<typeof createNostrActions> | null>(null)

  if (!actionsRef.current) {
    actionsRef.current = createNostrActions({
      tRef,
      profileRef,
      accountsRef,
      signerRef,
      activeAccountRef,
      lastPublishedSeenNotificationsAtEventAtMap,
      scheduledPostProcessingIdsRef,
      scheduledPostFailureToastAtRef,
      setAccounts,
      setAccount,
      setNsec,
      setNcryptsec,
      setSigner,
      setProfile,
      setProfileEvent,
      setRelayList,
      setInboxRelayUrls,
      setFollowListEvent,
      setMuteListEvent,
      setBookmarkListEvent,
      setFavoriteRelaysEvent,
      setUserEmojiListEvent,
      setPinListEvent,
      setNotificationsSeenAt,
      setIsInitialized,
      setNip44Supported,
      setOpenLoginDialog,
      addDeletedEvent
    })
  }
  const actions = actionsRef.current!

  useEffect(() => {
    activeAccountRef.current = account
  }, [account])

  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    signerRef.current = signer
  }, [signer])

  useEffect(() => {
    void actions.bootstrapSession().then(() => {
      setIsInitialized(true)
    })

    const handleHashChange = () => {
      if (actions.hasNostrLoginHash()) {
        void actions.loginByNostrLoginHash()
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [actions])

  useEffect(() => {
    void actions.preloadAccountProfiles()
  }, [actions, accounts])

  useEffect(() => {
    const promise = actions.loadAccountState()
    return () => {
      promise.then((controller) => {
        controller?.abort()
      })
    }
  }, [actions, account, signer])

  useEffect(() => {
    void actions.loadInteractions()
  }, [actions, account])

  useEffect(() => {
    if (signer) {
      client.signer = signer
    } else {
      client.signer = undefined
    }
  }, [signer])

  useEffect(() => {
    client.pubkey = account?.pubkey
  }, [account])

  useEffect(() => {
    setNip44Supported(signer?.supportsNip44() ?? false)
  }, [signer])

  useEffect(() => {
    customEmojiService.init(userEmojiListEvent)
  }, [userEmojiListEvent])

  useScheduledPostsProcessor({
    account,
    isInitialized,
    publish: actions.publish,
    t,
    activeAccountRef,
    scheduledPostProcessingIdsRef,
    scheduledPostFailureToastAtRef
  })

  return (
    <NostrContext.Provider
      value={{
        isInitialized,
        pubkey: account?.pubkey ?? null,
        profile,
        profileEvent,
        relayList,
        inboxRelayUrls,
        nip44Supported,
        followListEvent,
        muteListEvent,
        bookmarkListEvent,
        favoriteRelaysEvent,
        userEmojiListEvent,
        pinListEvent,
        notificationsSeenAt,
        account,
        accounts,
        nsec,
        ncryptsec,
        switchAccount: actions.switchAccount,
        nsecLogin: actions.nsecLogin,
        ncryptsecLogin: actions.ncryptsecLogin,
        nip07Login: actions.nip07Login,
        bunkerLogin: actions.bunkerLogin,
        nostrConnectionLogin: actions.nostrConnectionLogin,
        npubLogin: actions.npubLogin,
        removeAccount: actions.removeAccount,
        publish: actions.publish,
        attemptDelete: actions.attemptDelete,
        signHttpAuth: actions.signHttpAuth,
        nip04Encrypt: actions.nip04Encrypt,
        nip04Decrypt: actions.nip04Decrypt,
        nip44Encrypt: actions.nip44Encrypt,
        nip44Decrypt: actions.nip44Decrypt,
        startLogin: actions.startLogin,
        checkLogin: actions.checkLogin,
        signEvent: actions.signEvent,
        updateRelayListEvent: actions.updateRelayListEvent,
        updateInboxRelayEvent: actions.updateInboxRelayEvent,
        updateProfileEvent: actions.updateProfileEvent,
        updateFollowListEvent: actions.updateFollowListEvent,
        updateMuteListEvent: actions.updateMuteListEvent,
        updateBookmarkListEvent: actions.updateBookmarkListEvent,
        updateFavoriteRelaysEvent: actions.updateFavoriteRelaysEvent,
        updatePinListEvent: actions.updatePinListEvent,
        updateNotificationsSeenAt: actions.updateNotificationsSeenAt
      }}
    >
      {children}
      <LoginDialog open={openLoginDialog} setOpen={setOpenLoginDialog} />
    </NostrContext.Provider>
  )
}
