import { ApplicationDataKey, BIG_RELAY_URLS, DEFAULT_READ_RELAY_URLS, DEFAULT_WRITE_RELAY_URLS, ExtendedKind } from '@/constants'
import {
  createInboxRelayListDraftEvent,
  createDeletionRequestDraftEvent,
  createFollowListDraftEvent,
  createMuteListDraftEvent,
  createRelayListDraftEvent,
  createSeenNotificationsAtDraftEvent,
  deleteDraftEventCache
} from '@/lib/draft-event'
import { getLatestEvent, getReplaceableEventIdentifier, isProtectedEvent, minePow } from '@/lib/event'
import { getInboxRelayUrlsFromEvent, getProfileFromEvent, getRelayListFromEvent } from '@/lib/event-metadata'
import { formatPubkey, pubkeyToNpub } from '@/lib/pubkey'
import client from '@/services/client.service'
import inboxRelayRecommendationsService from '@/services/inbox-relay-recommendations.service'
import indexedDb from '@/services/indexed-db.service'
import storage from '@/services/local-storage.service'
import noteStatsService from '@/services/note-stats.service'
import scheduledPostsService from '@/services/scheduled-posts.service'
import { ISigner, TAccount, TAccountPointer, TDraftEvent, TProfile, TPublishOptions, TRelayList } from '@/types'
import { hexToBytes } from '@noble/hashes/utils'
import dayjs from 'dayjs'
import { TFunction } from 'i18next'
import { Event, kinds, VerifiedEvent } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import * as nip49 from 'nostr-tools/nip49'
import { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import { BunkerSigner } from './bunker.signer'
import { Nip07Signer } from './nip-07.signer'
import { NostrConnectionSigner } from './nostrConnection.signer'
import { NpubSigner } from './npub.signer'
import { NsecSigner } from './nsec.signer'

type TNostrActionDeps = {
  tRef: MutableRefObject<TFunction>
  profileRef: MutableRefObject<TProfile | null>
  accountsRef: MutableRefObject<TAccountPointer[]>
  signerRef: MutableRefObject<ISigner | null>
  activeAccountRef: MutableRefObject<TAccountPointer | null>
  lastPublishedSeenNotificationsAtEventAtMap: Map<string, number>
  scheduledPostProcessingIdsRef: MutableRefObject<Set<string>>
  scheduledPostFailureToastAtRef: MutableRefObject<Map<string, number>>
  setAccounts: Dispatch<SetStateAction<TAccountPointer[]>>
  setAccount: Dispatch<SetStateAction<TAccountPointer | null>>
  setNsec: Dispatch<SetStateAction<string | null>>
  setNcryptsec: Dispatch<SetStateAction<string | null>>
  setSigner: Dispatch<SetStateAction<ISigner | null>>
  setProfile: Dispatch<SetStateAction<TProfile | null>>
  setProfileEvent: Dispatch<SetStateAction<Event | null>>
  setRelayList: Dispatch<SetStateAction<TRelayList | null>>
  setInboxRelayUrls: Dispatch<SetStateAction<string[]>>
  setFollowListEvent: Dispatch<SetStateAction<Event | null>>
  setMuteListEvent: Dispatch<SetStateAction<Event | null>>
  setBookmarkListEvent: Dispatch<SetStateAction<Event | null>>
  setFavoriteRelaysEvent: Dispatch<SetStateAction<Event | null>>
  setUserEmojiListEvent: Dispatch<SetStateAction<Event | null>>
  setPinListEvent: Dispatch<SetStateAction<Event | null>>
  setNotificationsSeenAt: Dispatch<SetStateAction<number>>
  setIsInitialized: Dispatch<SetStateAction<boolean>>
  setNip44Supported: Dispatch<SetStateAction<boolean>>
  setOpenLoginDialog: Dispatch<SetStateAction<boolean>>
  addDeletedEvent: (event: Event) => void
}

function getDefaultInboxRelayUrls(nextRelayList: TRelayList | null, accountPubkey?: string | null) {
  const fallbackRelayUrls = Array.from(
    new Set((nextRelayList?.read.length ? nextRelayList.read : DEFAULT_READ_RELAY_URLS).slice(0, 3))
  )

  if (!accountPubkey) {
    return fallbackRelayUrls
  }

  return inboxRelayRecommendationsService
    .getAutoPickInboxRelayUrls(accountPubkey, fallbackRelayUrls)
    .catch((error) => {
      console.error('Failed to auto-pick inbox relays:', error)
      return fallbackRelayUrls
    })
}

export function createNostrActions({
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
}: TNostrActionDeps) {
  const hasNostrLoginHash = () => {
    return window.location.hash && window.location.hash.startsWith('#nostr-login')
  }

  const login = (signer: ISigner, act: TAccount) => {
    const newAccounts = storage.addAccount(act)
    setAccounts(newAccounts)
    storage.switchAccount(act)
    activeAccountRef.current = { pubkey: act.pubkey, signerType: act.signerType }
    signerRef.current = signer
    setAccount({ pubkey: act.pubkey, signerType: act.signerType })
    setSigner(signer)
    return act.pubkey
  }

  const removeAccount = (act: TAccountPointer) => {
    scheduledPostsService.removeScheduledPostsForAccount(act.pubkey)
    const newAccounts = storage.removeAccount(act)
    setAccounts(newAccounts)
    if (activeAccountRef.current?.pubkey === act.pubkey) {
      activeAccountRef.current = null
      signerRef.current = null
      setAccount(null)
      setSigner(null)
    }
  }

  const switchAccount = async (act: TAccountPointer | null) => {
    if (!act) {
      storage.switchAccount(null)
      activeAccountRef.current = null
      signerRef.current = null
      setAccount(null)
      setSigner(null)
      return
    }
    await loginWithAccountPointer(act)
  }

  const nsecLogin = async (nsecOrHex: string, password?: string, needSetup?: boolean) => {
    const nsecSigner = new NsecSigner()
    let privkey: Uint8Array
    if (nsecOrHex.startsWith('nsec')) {
      const { type, data } = nip19.decode(nsecOrHex)
      if (type !== 'nsec') {
        throw new Error('invalid nsec or hex')
      }
      privkey = data
    } else if (/^[0-9a-fA-F]{64}$/.test(nsecOrHex)) {
      privkey = hexToBytes(nsecOrHex)
    } else {
      throw new Error('invalid nsec or hex')
    }
    const pubkey = nsecSigner.login(privkey)
    if (password) {
      const ncryptsec = nip49.encrypt(privkey, password)
      login(nsecSigner, { pubkey, signerType: 'ncryptsec', ncryptsec })
    } else {
      login(nsecSigner, { pubkey, signerType: 'nsec', nsec: nip19.nsecEncode(privkey) })
    }
    if (needSetup) {
      await setupNewUser(nsecSigner)
    }
    return pubkey
  }

  const ncryptsecLogin = async (ncryptsec: string) => {
    const password = prompt(tRef.current('Enter the password to decrypt your ncryptsec'))
    if (!password) {
      throw new Error('Password is required')
    }
    const privkey = nip49.decrypt(ncryptsec, password)
    const browserNsecSigner = new NsecSigner()
    const pubkey = browserNsecSigner.login(privkey)
    return login(browserNsecSigner, { pubkey, signerType: 'ncryptsec', ncryptsec })
  }

  const npubLogin = async (npub: string) => {
    const npubSigner = new NpubSigner()
    const pubkey = npubSigner.login(npub)
    return login(npubSigner, { pubkey, signerType: 'npub', npub })
  }

  const nip07Login = async () => {
    try {
      const nip07Signer = new Nip07Signer()
      await nip07Signer.init()
      const pubkey = await nip07Signer.getPublicKey()
      if (!pubkey) {
        throw new Error('You did not allow to access your pubkey')
      }
      return login(nip07Signer, { pubkey, signerType: 'nip-07' })
    } catch (err) {
      toast.error(tRef.current('Login failed') + ': ' + (err as Error).message)
      throw err
    }
  }

  const bunkerLogin = async (bunker: string) => {
    const bunkerSigner = new BunkerSigner()
    const pubkey = await bunkerSigner.login(bunker)
    if (!pubkey) {
      throw new Error('Invalid bunker')
    }
    const bunkerUrl = new URL(bunker)
    bunkerUrl.searchParams.delete('secret')
    return login(bunkerSigner, {
      pubkey,
      signerType: 'bunker',
      bunker: bunkerUrl.toString(),
      bunkerClientSecretKey: bunkerSigner.getClientSecretKey()
    })
  }

  const nostrConnectionLogin = async (clientSecretKey: Uint8Array, connectionString: string) => {
    const bunkerSigner = new NostrConnectionSigner(clientSecretKey, connectionString)
    const loginResult = await bunkerSigner.login()
    if (!loginResult.pubkey) {
      throw new Error('Invalid bunker')
    }
    const bunkerUrl = new URL(loginResult.bunkerString!)
    bunkerUrl.searchParams.delete('secret')
    return login(bunkerSigner, {
      pubkey: loginResult.pubkey,
      signerType: 'bunker',
      bunker: bunkerUrl.toString(),
      bunkerClientSecretKey: bunkerSigner.getClientSecretKey()
    })
  }

  const loginWithAccountPointer = async (act: TAccountPointer): Promise<string | null> => {
    let accountRecord = storage.findAccount(act)
    if (!accountRecord) {
      return null
    }
    if (accountRecord.signerType === 'nsec' || accountRecord.signerType === 'browser-nsec') {
      if (accountRecord.nsec) {
        const browserNsecSigner = new NsecSigner()
        browserNsecSigner.login(accountRecord.nsec)
        if (accountRecord.signerType === 'browser-nsec') {
          storage.removeAccount(accountRecord)
          accountRecord = { ...accountRecord, signerType: 'nsec' }
          storage.addAccount(accountRecord)
        }
        return login(browserNsecSigner, accountRecord)
      }
    } else if (accountRecord.signerType === 'ncryptsec') {
      if (accountRecord.ncryptsec) {
        const password = prompt(tRef.current('Enter the password to decrypt your ncryptsec'))
        if (!password) {
          return null
        }
        const privkey = nip49.decrypt(accountRecord.ncryptsec, password)
        const browserNsecSigner = new NsecSigner()
        browserNsecSigner.login(privkey)
        return login(browserNsecSigner, accountRecord)
      }
    } else if (accountRecord.signerType === 'nip-07') {
      const nip07Signer = new Nip07Signer()
      await nip07Signer.init()
      return login(nip07Signer, accountRecord)
    } else if (accountRecord.signerType === 'bunker') {
      if (accountRecord.bunker && accountRecord.bunkerClientSecretKey) {
        const bunkerSigner = new BunkerSigner(accountRecord.bunkerClientSecretKey)
        const pubkey = await bunkerSigner.login(accountRecord.bunker, false)
        if (!pubkey) {
          storage.removeAccount(accountRecord)
          return null
        }
        if (pubkey !== accountRecord.pubkey) {
          storage.removeAccount(accountRecord)
          accountRecord = { ...accountRecord, pubkey }
          storage.addAccount(accountRecord)
        }
        return login(bunkerSigner, accountRecord)
      }
    } else if (accountRecord.signerType === 'npub' && accountRecord.npub) {
      const npubSigner = new NpubSigner()
      const pubkey = npubSigner.login(accountRecord.npub)
      if (!pubkey) {
        storage.removeAccount(accountRecord)
        return null
      }
      if (pubkey !== accountRecord.pubkey) {
        storage.removeAccount(accountRecord)
        accountRecord = { ...accountRecord, pubkey }
        storage.addAccount(accountRecord)
      }
      return login(npubSigner, accountRecord)
    }
    storage.removeAccount(accountRecord)
    return null
  }

  const setupNewUser = async (signer: ISigner) => {
    const defaultMailboxRelays = Array.from(
      new Set([...DEFAULT_READ_RELAY_URLS, ...DEFAULT_WRITE_RELAY_URLS])
    ).map((url) => {
      const isRead = DEFAULT_READ_RELAY_URLS.includes(url)
      const isWrite = DEFAULT_WRITE_RELAY_URLS.includes(url)
      return {
        url,
        scope: isRead && isWrite ? 'both' : isRead ? 'read' : 'write'
      } as const
    })
    const defaultInboxRelayUrls = Array.from(new Set(DEFAULT_READ_RELAY_URLS)).slice(0, 3)

    await Promise.allSettled([
      client.publishEvent(BIG_RELAY_URLS, await signer.signEvent(createFollowListDraftEvent([]))),
      client.publishEvent(BIG_RELAY_URLS, await signer.signEvent(createMuteListDraftEvent([]))),
      client.publishEvent(
        BIG_RELAY_URLS,
        await signer.signEvent(createRelayListDraftEvent(defaultMailboxRelays))
      ),
      client.publishEvent(
        BIG_RELAY_URLS,
        await signer.signEvent(createInboxRelayListDraftEvent(defaultInboxRelayUrls))
      )
    ])
  }

  const bootstrapSession = async () => {
    if (hasNostrLoginHash()) {
      return await loginByNostrLoginHash()
    }

    const storedAccounts = storage.getAccounts()
    const act = storage.getCurrentAccount() ?? storedAccounts[0]
    if (!act) return

    await loginWithAccountPointer(act)
  }

  const preloadAccountProfiles = async () => {
    const accountPubkeys = accountsRef.current.map((acc) => acc.pubkey)
    if (accountPubkeys.length === 0) return

    const profileEvents = await Promise.all(
      accountPubkeys.map((pubkey) => indexedDb.getReplaceableEvent(pubkey, kinds.Metadata))
    )

    profileEvents.forEach((event) => {
      if (event) {
        client.addEventToCache(event)
      }
    })
  }

  const loadAccountState = async () => {
    setRelayList(null)
    setInboxRelayUrls([])
    setProfile(null)
    setProfileEvent(null)
    setNsec(null)
    setFavoriteRelaysEvent(null)
    setFollowListEvent(null)
    setMuteListEvent(null)
    setBookmarkListEvent(null)
    setPinListEvent(null)
    setNotificationsSeenAt(-1)

    const account = activeAccountRef.current
    if (!account) {
      return null
    }

    const controller = new AbortController()
    const storedNsec = storage.getAccountNsec(account.pubkey)
    setNsec(storedNsec ?? null)
    const storedNcryptsec = storage.getAccountNcryptsec(account.pubkey)
    setNcryptsec(storedNcryptsec ?? null)

    const storedNotificationsSeenAt = storage.getLastReadNotificationTime(account.pubkey)
    const [
      storedRelayListEvent,
      storedInboxRelayEvent,
      storedProfileEvent,
      storedFollowListEvent,
      storedMuteListEvent,
      storedBookmarkListEvent,
      storedFavoriteRelaysEvent,
      storedUserEmojiListEvent,
      storedPinListEvent
    ] = await Promise.all([
      indexedDb.getReplaceableEvent(account.pubkey, kinds.RelayList),
      indexedDb.getReplaceableEvent(account.pubkey, ExtendedKind.INBOX_RELAYS),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.Metadata),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.Contacts),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.Mutelist),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.BookmarkList),
      indexedDb.getReplaceableEvent(account.pubkey, ExtendedKind.FAVORITE_RELAYS),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.UserEmojiList),
      indexedDb.getReplaceableEvent(account.pubkey, kinds.Pinlist)
    ])

    if (storedRelayListEvent) {
      setRelayList(getRelayListFromEvent(storedRelayListEvent))
    }
    if (storedInboxRelayEvent) {
      setInboxRelayUrls(getInboxRelayUrlsFromEvent(storedInboxRelayEvent))
    }
    if (storedProfileEvent) {
      setProfileEvent(storedProfileEvent)
      setProfile(getProfileFromEvent(storedProfileEvent))
      client.addEventToCache(storedProfileEvent)
    }
    if (storedFollowListEvent) setFollowListEvent(storedFollowListEvent)
    if (storedMuteListEvent) setMuteListEvent(storedMuteListEvent)
    if (storedBookmarkListEvent) setBookmarkListEvent(storedBookmarkListEvent)
    if (storedFavoriteRelaysEvent) setFavoriteRelaysEvent(storedFavoriteRelaysEvent)
    if (storedUserEmojiListEvent) setUserEmojiListEvent(storedUserEmojiListEvent)
    if (storedPinListEvent) setPinListEvent(storedPinListEvent)

    const relayListEvents = await client.fetchEvents(BIG_RELAY_URLS, {
      kinds: [kinds.RelayList],
      authors: [account.pubkey]
    })
    const relayListEvent = getLatestEvent(relayListEvents) ?? storedRelayListEvent
    const relayList = getRelayListFromEvent(relayListEvent)
    if (relayListEvent) {
      client.updateRelayListCache(relayListEvent)
      await indexedDb.putReplaceableEvent(relayListEvent)
    }
    setRelayList(relayList)
    client.setPreferredReadRelays(relayList.read)

    const inboxRelayEvents = await client.fetchEvents(BIG_RELAY_URLS, {
      kinds: [ExtendedKind.INBOX_RELAYS],
      authors: [account.pubkey]
    })
    let inboxRelayEvent = getLatestEvent(inboxRelayEvents) ?? storedInboxRelayEvent ?? null
    const hasPublishedInboxRelays =
      inboxRelayEvent?.tags.some(([tagName]) => tagName === 'relay') ?? false

    if (
      (!inboxRelayEvent || !hasPublishedInboxRelays) &&
      signerRef.current?.supportsNip44() &&
      account.signerType !== 'npub'
    ) {
      const defaultInboxRelayUrls = await getDefaultInboxRelayUrls(relayList, account.pubkey)
      if (defaultInboxRelayUrls.length > 0) {
        try {
          inboxRelayEvent = await signerRef.current.signEvent(
            createInboxRelayListDraftEvent(defaultInboxRelayUrls)
          )
          await client.publishEvent(BIG_RELAY_URLS, inboxRelayEvent)
        } catch (error) {
          console.warn('Failed to publish default inbox relay list:', error)
        }
      }
    }

    if (inboxRelayEvent) {
      await client.updateInboxRelayListCache(inboxRelayEvent)
      await indexedDb.putReplaceableEvent(inboxRelayEvent)
    }
    setInboxRelayUrls(getInboxRelayUrlsFromEvent(inboxRelayEvent))

    const events = await client.fetchEvents(relayList.write.concat(BIG_RELAY_URLS).slice(0, 4), [
      {
        kinds: [
          kinds.Metadata,
          kinds.Contacts,
          kinds.Mutelist,
          kinds.BookmarkList,
          ExtendedKind.FAVORITE_RELAYS,
          ExtendedKind.BLOSSOM_SERVER_LIST,
          kinds.UserEmojiList,
          kinds.Pinlist
        ],
        authors: [account.pubkey]
      },
      {
        kinds: [kinds.Application],
        authors: [account.pubkey],
        '#d': [ApplicationDataKey.NOTIFICATIONS_SEEN_AT]
      }
    ])
    const sortedEvents = events.sort((a, b) => b.created_at - a.created_at)
    const profileEvent = sortedEvents.find((e) => e.kind === kinds.Metadata)
    const followListEvent = sortedEvents.find((e) => e.kind === kinds.Contacts)
    const muteListEvent = sortedEvents.find((e) => e.kind === kinds.Mutelist)
    const bookmarkListEvent = sortedEvents.find((e) => e.kind === kinds.BookmarkList)
    const favoriteRelaysEvent = sortedEvents.find((e) => e.kind === ExtendedKind.FAVORITE_RELAYS)
    const blossomServerListEvent = sortedEvents.find(
      (e) => e.kind === ExtendedKind.BLOSSOM_SERVER_LIST
    )
    const userEmojiListEvent = sortedEvents.find((e) => e.kind === kinds.UserEmojiList)
    const notificationsSeenAtEvent = sortedEvents.find(
      (e) =>
        e.kind === kinds.Application &&
        getReplaceableEventIdentifier(e) === ApplicationDataKey.NOTIFICATIONS_SEEN_AT
    )
    const pinnedNotesEvent = sortedEvents.find((e) => e.kind === kinds.Pinlist)

    if (profileEvent) {
      const updatedProfileEvent = await indexedDb.putReplaceableEvent(profileEvent)
      if (updatedProfileEvent.id === profileEvent.id) {
        setProfileEvent(updatedProfileEvent)
        setProfile(getProfileFromEvent(updatedProfileEvent))
      }
    } else if (!storedProfileEvent) {
      setProfile({
        pubkey: account.pubkey,
        npub: pubkeyToNpub(account.pubkey) ?? '',
        username: formatPubkey(account.pubkey)
      })
    }
    if (followListEvent) {
      const updatedFollowListEvent = await indexedDb.putReplaceableEvent(followListEvent)
      if (updatedFollowListEvent.id === followListEvent.id) {
        setFollowListEvent(followListEvent)
      }
    }
    if (muteListEvent) {
      const updatedMuteListEvent = await indexedDb.putReplaceableEvent(muteListEvent)
      if (updatedMuteListEvent.id === muteListEvent.id) {
        setMuteListEvent(muteListEvent)
      }
    }
    if (bookmarkListEvent) {
      const updatedBookmarkListEvent = await indexedDb.putReplaceableEvent(bookmarkListEvent)
      if (updatedBookmarkListEvent.id === bookmarkListEvent.id) {
        setBookmarkListEvent(bookmarkListEvent)
      }
    }
    if (favoriteRelaysEvent) {
      const updatedFavoriteRelaysEvent = await indexedDb.putReplaceableEvent(favoriteRelaysEvent)
      if (updatedFavoriteRelaysEvent.id === favoriteRelaysEvent.id) {
        setFavoriteRelaysEvent(updatedFavoriteRelaysEvent)
      }
    }
    if (blossomServerListEvent) {
      await client.updateBlossomServerListEventCache(blossomServerListEvent)
    }
    if (userEmojiListEvent) {
      const updatedUserEmojiListEvent = await indexedDb.putReplaceableEvent(userEmojiListEvent)
      if (updatedUserEmojiListEvent.id === userEmojiListEvent.id) {
        setUserEmojiListEvent(updatedUserEmojiListEvent)
      }
    }
    if (pinnedNotesEvent) {
      const updatedPinnedNotesEvent = await indexedDb.putReplaceableEvent(pinnedNotesEvent)
      if (updatedPinnedNotesEvent.id === pinnedNotesEvent.id) {
        setPinListEvent(updatedPinnedNotesEvent)
      }
    }

    const notificationsSeenAt = Math.max(notificationsSeenAtEvent?.created_at ?? 0, storedNotificationsSeenAt)
    setNotificationsSeenAt(notificationsSeenAt)
    storage.setLastReadNotificationTime(account.pubkey, notificationsSeenAt)
    client.initUserIndexFromFollowings(account.pubkey, controller.signal)
    return controller
  }

  const loadInteractions = async () => {
    const account = activeAccountRef.current
    if (!account) return
    const pubkey = account.pubkey
    const relayList = await client.fetchRelayList(pubkey)
    const events = await client.fetchEvents(relayList.write.slice(0, 4), [
      {
        authors: [pubkey],
        kinds: [kinds.Reaction, kinds.Repost],
        limit: 100
      },
      {
        '#P': [pubkey],
        kinds: [kinds.Zap],
        limit: 100
      }
    ])
    noteStatsService.updateNoteStatsByEvents(events)
  }

  const signEvent = async (draftEvent: TDraftEvent) => {
    const currentSigner = signerRef.current
    const event = await currentSigner?.signEvent(draftEvent)
    if (!event) {
      throw new Error('sign event failed')
    }
    return event as VerifiedEvent
  }

  const publish = async (
    draftEvent: TDraftEvent,
    { minPow = 0, ...options }: TPublishOptions = {}
  ) => {
    const currentAccount = activeAccountRef.current
    const currentSigner = signerRef.current

    if (!currentAccount || !currentSigner || currentAccount.signerType === 'npub') {
      throw new Error('You need to login first')
    }

    const draft = JSON.parse(JSON.stringify(draftEvent)) as TDraftEvent
    let event: VerifiedEvent
    if (minPow > 0) {
      const unsignedEvent = await minePow({ ...draft, pubkey: currentAccount.pubkey }, minPow)
      event = await currentSigner.signEvent(unsignedEvent)
    } else {
      event = await currentSigner.signEvent(draft)
    }

    if (!event) {
      throw new Error('sign event failed')
    }

    if (event.kind !== kinds.Application && event.pubkey !== currentAccount.pubkey) {
      const eventAuthor = await client.fetchProfile(event.pubkey)
      const result = confirm(
        tRef.current(
          'You are about to publish an event signed by [{{eventAuthorName}}]. You are currently logged in as [{{currentUsername}}]. Are you sure?',
          { eventAuthorName: eventAuthor?.username, currentUsername: profileRef.current?.username }
        )
      )
      if (!result) {
        throw new Error(tRef.current('Cancelled'))
      }
    }

    const relays = await client.determineTargetRelays(event, options)
    await client.publishEvent(relays, event)
    return event
  }

  const attemptDelete = async (targetEvent: Event) => {
    const currentSigner = signerRef.current
    const currentAccount = activeAccountRef.current

    if (!currentSigner) {
      throw new Error(tRef.current('You need to login first'))
    }
    if (currentAccount?.pubkey !== targetEvent.pubkey) {
      throw new Error(tRef.current('You can only delete your own notes'))
    }

    const deletionRequest = await signEvent(createDeletionRequestDraftEvent(targetEvent))
    const seenOn = client.getSeenEventRelayUrls(targetEvent.id)
    const relays = await client.determineTargetRelays(targetEvent, {
      specifiedRelayUrls: isProtectedEvent(targetEvent) ? seenOn : undefined,
      additionalRelayUrls: seenOn
    })

    await client.publishEvent(relays, deletionRequest)
    addDeletedEvent(targetEvent)
    toast.success(tRef.current('Deletion request sent to {{count}} relays', { count: relays.length }))
  }

  const signHttpAuth = async (url: string, method: string, content = '') => {
    const event = await signEvent({
      content,
      kind: kinds.HTTPAuth,
      created_at: dayjs().unix(),
      tags: [
        ['u', url],
        ['method', method]
      ]
    })
    return 'Nostr ' + btoa(JSON.stringify(event))
  }

  const nip44Encrypt = async (pubkey: string, plainText: string) => {
    return signerRef.current?.nip44Encrypt(pubkey, plainText) ?? ''
  }

  const nip44Decrypt = async (pubkey: string, cipherText: string) => {
    return signerRef.current?.nip44Decrypt(pubkey, cipherText) ?? ''
  }

  const nip04Encrypt = async (pubkey: string, plainText: string) => {
    return signerRef.current?.nip04Encrypt(pubkey, plainText) ?? ''
  }

  const nip04Decrypt = async (pubkey: string, cipherText: string) => {
    return signerRef.current?.nip04Decrypt(pubkey, cipherText) ?? ''
  }

  const checkLogin = async <T,>(cb?: () => T): Promise<T | void> => {
    if (signerRef.current) {
      return cb && cb()
    }
    return setOpenLoginDialog(true)
  }

  const updateRelayListEvent = async (relayListEvent: Event) => {
    const newRelayList = await indexedDb.putReplaceableEvent(relayListEvent)
    const nextRelayList = getRelayListFromEvent(newRelayList)
    setRelayList(nextRelayList)
    client.setPreferredReadRelays(nextRelayList.read)
  }

  const updateInboxRelayEvent = async (inboxRelayEvent: Event) => {
    const newInboxRelayEvent = await indexedDb.putReplaceableEvent(inboxRelayEvent)
    const nextInboxRelayUrls = getInboxRelayUrlsFromEvent(newInboxRelayEvent)
    setInboxRelayUrls(nextInboxRelayUrls)
    await client.updateInboxRelayListCache(newInboxRelayEvent)
  }

  const updateProfileEvent = async (profileEvent: Event) => {
    const newProfileEvent = await indexedDb.putReplaceableEvent(profileEvent)
    setProfileEvent(newProfileEvent)
    setProfile(getProfileFromEvent(newProfileEvent))
  }

  const updateFollowListEvent = async (followListEvent: Event) => {
    const newFollowListEvent = await indexedDb.putReplaceableEvent(followListEvent)
    if (newFollowListEvent.id !== followListEvent.id) return
    setFollowListEvent(newFollowListEvent)
    await client.updateFollowListCache(newFollowListEvent)
  }

  const updateMuteListEvent = async (muteListEvent: Event, privateTags: string[][]) => {
    const newMuteListEvent = await indexedDb.putReplaceableEvent(muteListEvent)
    if (newMuteListEvent.id !== muteListEvent.id) return
    await indexedDb.putMuteDecryptedTags(muteListEvent.id, privateTags)
    setMuteListEvent(muteListEvent)
  }

  const updateBookmarkListEvent = async (bookmarkListEvent: Event) => {
    const newBookmarkListEvent = await indexedDb.putReplaceableEvent(bookmarkListEvent)
    if (newBookmarkListEvent.id !== bookmarkListEvent.id) return
    setBookmarkListEvent(newBookmarkListEvent)
  }

  const updateFavoriteRelaysEvent = async (favoriteRelaysEvent: Event) => {
    const newFavoriteRelaysEvent = await indexedDb.putReplaceableEvent(favoriteRelaysEvent)
    if (newFavoriteRelaysEvent.id !== favoriteRelaysEvent.id) return
    setFavoriteRelaysEvent(newFavoriteRelaysEvent)
  }

  const updatePinListEvent = async (pinListEvent: Event) => {
    const newPinListEvent = await indexedDb.putReplaceableEvent(pinListEvent)
    if (newPinListEvent.id !== pinListEvent.id) return
    setPinListEvent(newPinListEvent)
  }

  const updateNotificationsSeenAt = async (skipPublish = false) => {
    const account = activeAccountRef.current
    if (!account) return

    const now = dayjs().unix()
    storage.setLastReadNotificationTime(account.pubkey, now)
    setTimeout(() => {
      setNotificationsSeenAt(now)
    }, 5_000)

    const lastPublishedSeenNotificationsAtEventAt =
      lastPublishedSeenNotificationsAtEventAtMap.get(account.pubkey) ?? -1
    if (
      !skipPublish &&
      (lastPublishedSeenNotificationsAtEventAt < 0 ||
        now - lastPublishedSeenNotificationsAtEventAt > 10 * 60)
    ) {
      await publish(createSeenNotificationsAtDraftEvent())
      lastPublishedSeenNotificationsAtEventAtMap.set(account.pubkey, now)
    }
  }

  const loginByNostrLoginHash = async () => {
    const credential = window.location.hash.replace('#nostr-login=', '')
    const urlWithoutHash = window.location.href.split('#')[0]
    history.replaceState(null, '', urlWithoutHash)

    if (credential.startsWith('bunker://')) {
      return await bunkerLogin(credential)
    } else if (credential.startsWith('ncryptsec')) {
      return await ncryptsecLogin(credential)
    } else if (credential.startsWith('nsec')) {
      return await nsecLogin(credential)
    }
  }

  const startLogin = () => setOpenLoginDialog(true)

  return {
    hasNostrLoginHash,
    login,
    removeAccount,
    switchAccount,
    nsecLogin,
    ncryptsecLogin,
    npubLogin,
    nip07Login,
    bunkerLogin,
    nostrConnectionLogin,
    loginWithAccountPointer,
    setupNewUser,
    bootstrapSession,
    preloadAccountProfiles,
    loadAccountState,
    loadInteractions,
    signEvent,
    publish,
    attemptDelete,
    signHttpAuth,
    nip04Encrypt,
    nip04Decrypt,
    nip44Encrypt,
    nip44Decrypt,
    checkLogin,
    updateRelayListEvent,
    updateInboxRelayEvent,
    updateProfileEvent,
    updateFollowListEvent,
    updateMuteListEvent,
    updateBookmarkListEvent,
    updateFavoriteRelaysEvent,
    updatePinListEvent,
    updateNotificationsSeenAt,
    loginByNostrLoginHash,
    startLogin
  }
}
