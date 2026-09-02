import {
  BUTTON_RADIUS_VALUES,
  CARD_RADIUS_VALUES,
  MEDIA_RADIUS_VALUES,
  DEFAULT_BUTTON_RADIUS,
  DEFAULT_CARD_RADIUS,
  DEFAULT_MEDIA_RADIUS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_NEWS_WIDGET_RELAYS as DEFAULT_NEWS_FEED_RELAYS,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_LOGO_FONT_SIZE,
  DEFAULT_NIP_96_SERVICE,
  DEFAULT_PAGE_THEME,
  DEFAULT_POST_BUTTON_STYLE,
  DEFAULT_PRIMARY_COLOR,
  DISTRACTION_FREE_MODE,
  ExtendedKind,
  FONT_FAMILIES,
  FONT_SIZES,
  TITLE_FONT_SIZES,
  LOGO_FONT_SIZES,
  MEDIA_AUTO_LOAD_POLICY,
  NOTIFICATION_LIST_STYLE,
  POST_BUTTON_STYLE,
  PRIMARY_COLORS,
  SUPPORTED_KINDS,
  StorageKey
} from '@/constants'
import { isSameAccount } from '@/lib/account'
import { normalizePollCreateData } from '@/lib/poll'
import { randomString } from '@/lib/random'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import {
  TAccount,
  TAccountPointer,
  TCustomFeed,
  TDistractionFreeMode,
  TFeedInfo,
  TFontFamily,
  TMediaAutoLoadPolicy,
  TMediaUploadServiceConfig,
  TLocalPostDraft,
  TNoteListMode,
  TNotificationStyle,
  TPageTheme,
  TPostButtonStyle,
  TPrimaryColor,
  TRelaySet,
  TThemeSetting,
  TColorPalette,
  TEmoji,
  TLogoStyle
} from '@/types'
import type { JSONContent } from '@tiptap/react'
import { TMenuItemConfig } from '@/constants/menu-items'
import {
  getDefaultMenuItems,
  mergeMenuItemsWithDefaults,
  migrateLegacyMessagesMenuPosition
} from '@/services/local-storage/menu-items'
import {
  readStoredBoolean,
  readStoredBooleanValue,
  readStoredEnum,
  readStoredJson,
  readStoredString,
  readStoredStringArray,
  readStoredStringValue
} from '@/services/local-storage/readers'
import {
  getStorageItem,
  removeStorageItem,
  setStorageBoolean,
  setStorageItem,
  setStorageJson,
  setStorageNumber
} from '@/services/local-storage/persistence'

class LocalStorageService {
  static instance: LocalStorageService

  private relaySets: TRelaySet[] = []
  private themeSetting: TThemeSetting = 'dark'
  private colorPalette: TColorPalette = 'default'
  private accounts: TAccount[] = []
  private currentAccount: TAccount | null = null
  private noteListMode: TNoteListMode = 'posts'
  private lastReadNotificationTimeMap: Record<string, number> = {}
  private accountFeedInfoMap: Record<string, TFeedInfo | undefined> = {}
  private mediaUploadService: string = DEFAULT_NIP_96_SERVICE
  private autoplay: boolean = true
  private hideUntrustedInteractions: boolean = false
  private hideUntrustedNotifications: boolean = false
  private hideUntrustedNotes: boolean = false
  private trustLevel: number = 0 // 0: Everyone, 1: Network + Follows, 2: Follows only, 3: You only
  private mediaUploadServiceConfigMap: Record<string, TMediaUploadServiceConfig> = {}
  private defaultShowNsfw: boolean = false
  private showKinds: number[] = []
  private mediaOnly: boolean = true
  private hideContentMentioningMutedUsers: boolean = false
  private alwaysHideMutedNotes: boolean = false
  private hideNotificationsFromMutedUsers: boolean = false
  private notificationListStyle: TNotificationStyle = NOTIFICATION_LIST_STYLE.COMPACT
  private mediaAutoLoadPolicy: TMediaAutoLoadPolicy = MEDIA_AUTO_LOAD_POLICY.ALWAYS
  private fontSize: number = DEFAULT_FONT_SIZE
  private titleFontSize: number = DEFAULT_TITLE_FONT_SIZE
  private fontFamily: TFontFamily = DEFAULT_FONT_FAMILY
  private primaryColor: TPrimaryColor = DEFAULT_PRIMARY_COLOR
  private buttonRadius: number = DEFAULT_BUTTON_RADIUS
  private postButtonStyle: TPostButtonStyle = DEFAULT_POST_BUTTON_STYLE
  private cardRadius: number = DEFAULT_CARD_RADIUS
  private mediaRadius: number = DEFAULT_MEDIA_RADIUS
  private pageTheme: TPageTheme = DEFAULT_PAGE_THEME
  private compactSidebar: boolean = true
  private logoStyle: TLogoStyle = 'image'
  private customLogoText: string = 'Halo'
  private customLogoEmoji: string | TEmoji = '⚡'
  private logoFontSize: number = DEFAULT_LOGO_FONT_SIZE
  private maxHashtags: number = 3
  private maxMentions: number = 0
  private newsFeedRelays: string[] = DEFAULT_NEWS_FEED_RELAYS
  private customFeedsMap: Record<string, TCustomFeed[]> = {}
  private localPostDraftsMap: Record<string, TLocalPostDraft[]> = {}
  private distractionFreeMode: TDistractionFreeMode = DISTRACTION_FREE_MODE.DRAIN_MY_TIME
  private hideReadsInNavigation: boolean = false
  private hideReadsInProfiles: boolean = true
  private favoriteListsMap: Record<string, string[]> = {}
  private readArticles: Set<string> = new Set()
  private bookmarkTags: Record<string, string[]> = {}
  private pinnedReplies: Record<string, string[]> = {}
  private textOnlyMode: boolean = false
  private lowBandwidthMode: boolean = false
  private disableAvatarAnimations: boolean = false
  private reactionFountainEnabled: boolean = false
  private reactionOptionsEnabled: boolean = false
  private defaultReactionEmojis: string[] = ['👍', '❤️', '😂', '🥲', '👀', '🫡', '🫂']

  constructor() {
    if (!LocalStorageService.instance) {
      this.init()
      LocalStorageService.instance = this
    }
    return LocalStorageService.instance
  }

  private setString(key: string, value: string) {
    setStorageItem(key, value)
  }

  private setBoolean(key: string, value: boolean) {
    setStorageBoolean(key, value)
  }

  private setNumber(key: string, value: number) {
    setStorageNumber(key, value)
  }

  private setJson(key: string, value: unknown) {
    setStorageJson(key, value)
  }

  init() {
    this.initCoreState()
    this.initDisplayState()
    this.initFeedAndDraftState()
    this.initCollectionState()
    this.cleanupDeprecatedStorage()
  }

  private initCoreState() {
    this.themeSetting = readStoredString(StorageKey.THEME_SETTING, 'dark') as TThemeSetting
    this.colorPalette = readStoredString(StorageKey.COLOR_PALETTE, 'default') as TColorPalette
    this.accounts = readStoredJson<TAccount[]>(StorageKey.ACCOUNTS, [])
    this.currentAccount = readStoredJson<TAccount | null>(StorageKey.CURRENT_ACCOUNT, null)
    const noteListMode = readStoredStringValue(StorageKey.NOTE_LIST_MODE)
    this.noteListMode =
      noteListMode && ['posts', 'postsAndReplies', 'pictures'].includes(noteListMode)
        ? (noteListMode as TNoteListMode)
        : 'posts'
    this.lastReadNotificationTimeMap = readStoredJson<Record<string, number>>(
      StorageKey.LAST_READ_NOTIFICATION_TIME_MAP,
      {}
    )
    this.relaySets = this.loadRelaySets()
    this.accountFeedInfoMap = readStoredJson<Record<string, TFeedInfo | undefined>>(
      StorageKey.ACCOUNT_FEED_INFO_MAP,
      {}
    )
    this.mediaUploadService = readStoredString(
      StorageKey.MEDIA_UPLOAD_SERVICE,
      DEFAULT_NIP_96_SERVICE
    )
    this.autoplay = readStoredBooleanValue(StorageKey.AUTOPLAY) ?? true

    const hideUntrustedEvents = readStoredBooleanValue(StorageKey.HIDE_UNTRUSTED_EVENTS) ?? false
    const storedHideUntrustedInteractions = readStoredBooleanValue(
      StorageKey.HIDE_UNTRUSTED_INTERACTIONS
    )
    const storedHideUntrustedNotifications = readStoredBooleanValue(
      StorageKey.HIDE_UNTRUSTED_NOTIFICATIONS
    )
    const storedHideUntrustedNotes = readStoredBooleanValue(StorageKey.HIDE_UNTRUSTED_NOTES)
    this.hideUntrustedInteractions = storedHideUntrustedInteractions ?? hideUntrustedEvents
    this.hideUntrustedNotifications = storedHideUntrustedNotifications ?? hideUntrustedEvents
    this.hideUntrustedNotes = storedHideUntrustedNotes ?? hideUntrustedEvents

    const storedTrustLevel = readStoredStringValue(StorageKey.TRUST_LEVEL)
    this.trustLevel = storedTrustLevel ? parseInt(storedTrustLevel, 10) : 0

    this.mediaUploadServiceConfigMap = readStoredJson<Record<string, TMediaUploadServiceConfig>>(
      StorageKey.MEDIA_UPLOAD_SERVICE_CONFIG_MAP,
      {}
    )
  }

  private loadRelaySets() {
    const relaySetsStr = readStoredStringValue(StorageKey.RELAY_SETS)
    if (!relaySetsStr) {
      let relaySets: TRelaySet[] = []
      const legacyRelayGroupsStr = readStoredStringValue('relayGroups')
      if (legacyRelayGroupsStr) {
        const legacyRelayGroups = JSON.parse(legacyRelayGroupsStr)
        relaySets = legacyRelayGroups.map((group: any) => {
          return {
            id: randomString(),
            name: group.groupName,
            relayUrls: group.relayUrls
          }
        })
      }
      if (!relaySets.length) {
        relaySets = []
      }
      this.setJson(StorageKey.RELAY_SETS, relaySets)
      return relaySets
    }
    return JSON.parse(relaySetsStr)
  }

  private initDisplayState() {
    this.defaultShowNsfw = readStoredBoolean(StorageKey.DEFAULT_SHOW_NSFW)

    const showKindsStr = readStoredStringValue(StorageKey.SHOW_KINDS)
    if (!showKindsStr) {
      this.showKinds = SUPPORTED_KINDS
    } else {
      const showKindsVersionStr = readStoredStringValue(StorageKey.SHOW_KINDS_VERSION)
      const showKindsVersion = showKindsVersionStr ? parseInt(showKindsVersionStr, 10) : 0
      const showKinds = JSON.parse(showKindsStr) as number[]
      if (showKindsVersion < 1) {
        showKinds.push(ExtendedKind.VIDEO, ExtendedKind.SHORT_VIDEO)
      }
      this.showKinds = showKinds
    }
    window.localStorage.setItem(StorageKey.SHOW_KINDS, JSON.stringify(this.showKinds))
    window.localStorage.setItem(StorageKey.SHOW_KINDS_VERSION, '2')

    // Default to false so text-heavy relays do not appear empty on first load.
    this.mediaOnly = readStoredBoolean(StorageKey.MEDIA_ONLY)
    this.hideContentMentioningMutedUsers = readStoredBoolean(
      StorageKey.HIDE_CONTENT_MENTIONING_MUTED_USERS
    )
    this.alwaysHideMutedNotes = readStoredBoolean(StorageKey.ALWAYS_HIDE_MUTED_NOTES)
    this.hideNotificationsFromMutedUsers = readStoredBoolean(
      StorageKey.HIDE_NOTIFICATIONS_FROM_MUTED_USERS
    )

    const notificationListStyleStr = readStoredStringValue(StorageKey.NOTIFICATION_LIST_STYLE)
    // Default to compact for new users, otherwise use stored preference.
    this.notificationListStyle =
      notificationListStyleStr === null
        ? NOTIFICATION_LIST_STYLE.COMPACT
        : notificationListStyleStr === NOTIFICATION_LIST_STYLE.COMPACT
          ? NOTIFICATION_LIST_STYLE.COMPACT
          : NOTIFICATION_LIST_STYLE.DETAILED

    this.mediaAutoLoadPolicy = readStoredEnum(
      StorageKey.MEDIA_AUTO_LOAD_POLICY,
      Object.values(MEDIA_AUTO_LOAD_POLICY) as TMediaAutoLoadPolicy[],
      MEDIA_AUTO_LOAD_POLICY.ALWAYS
    )
    const fontSizeStr = readStoredStringValue(StorageKey.FONT_SIZE)
    if (fontSizeStr) {
      const fontSize = parseInt(fontSizeStr, 10)
      if (FONT_SIZES.includes(fontSize as any)) {
        this.fontSize = fontSize
      }
    }

    const titleFontSizeStr = readStoredStringValue(StorageKey.TITLE_FONT_SIZE)
    if (titleFontSizeStr) {
      const titleFontSize = parseInt(titleFontSizeStr, 10)
      if (TITLE_FONT_SIZES.includes(titleFontSize as any)) {
        this.titleFontSize = titleFontSize
      }
    }

    this.fontFamily = readStoredEnum(
      StorageKey.FONT_FAMILY,
      Object.keys(FONT_FAMILIES) as TFontFamily[],
      DEFAULT_FONT_FAMILY
    )
    this.primaryColor = readStoredEnum(
      StorageKey.PRIMARY_COLOR,
      Object.keys(PRIMARY_COLORS) as TPrimaryColor[],
      DEFAULT_PRIMARY_COLOR
    )

    const buttonRadiusStr = readStoredStringValue(StorageKey.BUTTON_RADIUS)
    if (buttonRadiusStr) {
      const buttonRadius = parseInt(buttonRadiusStr, 10)
      if (BUTTON_RADIUS_VALUES.includes(buttonRadius as any)) {
        this.buttonRadius = buttonRadius
      }
    }

    const postButtonStyle = readStoredStringValue(StorageKey.POST_BUTTON_STYLE)
    if (
      postButtonStyle &&
      (postButtonStyle === POST_BUTTON_STYLE.FILLED ||
        postButtonStyle === POST_BUTTON_STYLE.OUTLINED)
    ) {
      this.postButtonStyle = postButtonStyle as TPostButtonStyle
    }

    const cardRadiusStr = readStoredStringValue(StorageKey.CARD_RADIUS)
    if (cardRadiusStr) {
      const cardRadius = parseInt(cardRadiusStr, 10)
      if (CARD_RADIUS_VALUES.includes(cardRadius as any)) {
        this.cardRadius = cardRadius
      }
    }

    const mediaRadiusStr = readStoredStringValue(StorageKey.MEDIA_RADIUS)
    if (mediaRadiusStr) {
      const mediaRadius = parseInt(mediaRadiusStr, 10)
      if (MEDIA_RADIUS_VALUES.includes(mediaRadius as any)) {
        this.mediaRadius = mediaRadius
      }
    }

    this.pageTheme = readStoredEnum(
      StorageKey.PAGE_THEME,
      ['default', 'pure-black'] as const,
      DEFAULT_PAGE_THEME
    )
    this.compactSidebar = readStoredBoolean(StorageKey.COMPACT_SIDEBAR, true)
    this.logoStyle = readStoredEnum(
      StorageKey.LOGO_STYLE,
      ['image', 'text', 'emoji'] as const,
      'image'
    )

    const customLogoText = readStoredStringValue(StorageKey.CUSTOM_LOGO_TEXT)
    if (customLogoText) {
      this.customLogoText = customLogoText
    }

    const customLogoEmoji = readStoredJson<string | TEmoji | null>(
      StorageKey.CUSTOM_LOGO_EMOJI,
      null
    )
    if (typeof customLogoEmoji === 'string' && customLogoEmoji.trim()) {
      this.customLogoEmoji = customLogoEmoji
    } else if (
      customLogoEmoji &&
      typeof customLogoEmoji === 'object' &&
      typeof customLogoEmoji.shortcode === 'string' &&
      typeof customLogoEmoji.url === 'string'
    ) {
      this.customLogoEmoji = customLogoEmoji
    }

    const logoFontSize = readStoredStringValue(StorageKey.LOGO_FONT_SIZE)
    if (logoFontSize) {
      const size = Number(logoFontSize)
      if (LOGO_FONT_SIZES.includes(size as any)) {
        this.logoFontSize = size
      }
    }

  }

  private initFeedAndDraftState() {
    this.newsFeedRelays = readStoredStringArray(
      StorageKey.NEWS_WIDGET_RELAYS,
      DEFAULT_NEWS_FEED_RELAYS,
      (relay) => {
        const normalizedRelay = normalizeUrl(relay)
        return normalizedRelay && isWebsocketUrl(normalizedRelay) ? normalizedRelay : null
      }
    )

    const storedCustomFeeds = readStoredJson<unknown>(StorageKey.CUSTOM_FEEDS, {})
    if (Array.isArray(storedCustomFeeds)) {
      const ownerKey = this.getCustomFeedsOwnerKey(this.currentAccount?.pubkey)
      this.customFeedsMap = { [ownerKey]: this.sanitizeCustomFeeds(storedCustomFeeds) }
      this.setJson(StorageKey.CUSTOM_FEEDS, this.customFeedsMap)
    } else if (storedCustomFeeds && typeof storedCustomFeeds === 'object') {
      this.customFeedsMap = Object.fromEntries(
        Object.entries(storedCustomFeeds as Record<string, unknown>).map(([key, feeds]) => [
          key,
          this.sanitizeCustomFeeds(feeds)
        ])
      )
    }

    const storedLocalPostDrafts = readStoredJson<unknown>(StorageKey.LOCAL_POST_DRAFTS, {})
    if (storedLocalPostDrafts && typeof storedLocalPostDrafts === 'object') {
      this.localPostDraftsMap = Object.fromEntries(
        Object.entries(storedLocalPostDrafts as Record<string, unknown>).map(([key, drafts]) => [
          key,
          this.sanitizeLocalPostDrafts(drafts)
        ])
      )
    }

    this.textOnlyMode = readStoredBoolean(StorageKey.TEXT_ONLY_MODE)
    this.lowBandwidthMode = readStoredBoolean(StorageKey.LOW_BANDWIDTH_MODE)
    this.disableAvatarAnimations = readStoredBoolean(StorageKey.DISABLE_AVATAR_ANIMATIONS)
    this.reactionFountainEnabled = readStoredBoolean(StorageKey.REACTION_FOUNTAIN_ENABLED)
    this.distractionFreeMode = readStoredEnum(
      StorageKey.DISTRACTION_FREE_MODE,
      Object.values(DISTRACTION_FREE_MODE) as TDistractionFreeMode[],
      DISTRACTION_FREE_MODE.DRAIN_MY_TIME
    )
  }

  private initCollectionState() {
    this.hideReadsInNavigation = readStoredBoolean(StorageKey.HIDE_READS_IN_NAVIGATION, true)
    this.hideReadsInProfiles = readStoredBoolean(StorageKey.HIDE_READS_IN_PROFILES, true)

    const favoriteListsMapStr = readStoredStringValue(StorageKey.FAVORITE_LISTS)
    if (favoriteListsMapStr) {
      try {
        const parsed = JSON.parse(favoriteListsMapStr)
        // Handle migration from old array format to new map format.
        if (Array.isArray(parsed)) {
          this.favoriteListsMap = { _global: parsed }
        } else {
          this.favoriteListsMap = parsed
        }
      } catch {
        this.favoriteListsMap = {}
      }
    }

    const readArticlesStr = readStoredStringValue(StorageKey.READ_ARTICLES)
    if (readArticlesStr) {
      try {
        this.readArticles = new Set(JSON.parse(readArticlesStr))
      } catch {
        this.readArticles = new Set()
      }
    }

    const bookmarkTagsStr = readStoredStringValue(StorageKey.BOOKMARK_TAGS)
    if (bookmarkTagsStr) {
      try {
        this.bookmarkTags = JSON.parse(bookmarkTagsStr)
      } catch {
        this.bookmarkTags = {}
      }
    }

    const pinnedRepliesStr = readStoredStringValue(StorageKey.PINNED_REPLIES)
    if (pinnedRepliesStr) {
      try {
        this.pinnedReplies = JSON.parse(pinnedRepliesStr)
      } catch {
        this.pinnedReplies = {}
      }
    }

    const maxHashtagsStr = readStoredStringValue(StorageKey.MAX_HASHTAGS)
    if (maxHashtagsStr) {
      const num = parseInt(maxHashtagsStr, 10)
      if (!isNaN(num) && num >= 0 && num <= 10) {
        this.maxHashtags = num
      }
    }

    const maxMentionsStr = readStoredStringValue(StorageKey.MAX_MENTIONS)
    if (maxMentionsStr) {
      const num = parseInt(maxMentionsStr, 10)
      if (!isNaN(num) && num >= 0 && num <= 10) {
        this.maxMentions = num
      }
    }

    const defaultReactionEmojisStr = readStoredStringValue(StorageKey.DEFAULT_REACTION_EMOJIS)
    if (defaultReactionEmojisStr) {
      try {
        const emojis = JSON.parse(defaultReactionEmojisStr)
        if (Array.isArray(emojis) && emojis.every((e) => typeof e === 'string')) {
          this.defaultReactionEmojis = emojis
        }
      } catch {
        // Keep default.
      }
    }

    this.reactionOptionsEnabled = readStoredBoolean(StorageKey.REACTION_OPTIONS_ENABLED)
  }

  private cleanupDeprecatedStorage() {
    removeStorageItem(StorageKey.ACCOUNT_PROFILE_EVENT_MAP)
    removeStorageItem(StorageKey.ACCOUNT_FOLLOW_LIST_EVENT_MAP)
    removeStorageItem(StorageKey.ACCOUNT_RELAY_LIST_EVENT_MAP)
    removeStorageItem(StorageKey.ACCOUNT_MUTE_LIST_EVENT_MAP)
    removeStorageItem(StorageKey.ACCOUNT_MUTE_DECRYPTED_TAGS_MAP)
    removeStorageItem(StorageKey.ACTIVE_RELAY_SET_ID)
    removeStorageItem(StorageKey.FEED_TYPE)
  }

  getRelaySets() {
    return this.relaySets
  }

  setRelaySets(relaySets: TRelaySet[]) {
    this.relaySets = relaySets
    this.setJson(StorageKey.RELAY_SETS, this.relaySets)
  }

  getThemeSetting() {
    return this.themeSetting
  }

  setThemeSetting(themeSetting: TThemeSetting) {
    this.setString(StorageKey.THEME_SETTING, themeSetting)
    this.themeSetting = themeSetting
  }

  getColorPalette() {
    return this.colorPalette
  }

  setColorPalette(colorPalette: TColorPalette) {
    this.setString(StorageKey.COLOR_PALETTE, colorPalette)
    this.colorPalette = colorPalette
  }

  getNoteListMode() {
    return this.noteListMode
  }

  setNoteListMode(mode: TNoteListMode) {
    this.setString(StorageKey.NOTE_LIST_MODE, mode)
    this.noteListMode = mode
  }

  getAccounts() {
    return this.accounts
  }

  findAccount(account: TAccountPointer) {
    return this.accounts.find((act) => isSameAccount(act, account))
  }

  getCurrentAccount() {
    return this.currentAccount
  }

  getAccountNsec(pubkey: string) {
    const account = this.accounts.find((act) => act.pubkey === pubkey && act.signerType === 'nsec')
    return account?.nsec
  }

  getAccountNcryptsec(pubkey: string) {
    const account = this.accounts.find(
      (act) => act.pubkey === pubkey && act.signerType === 'ncryptsec'
    )
    return account?.ncryptsec
  }

  addAccount(account: TAccount) {
    const index = this.accounts.findIndex((act) => isSameAccount(act, account))
    if (index !== -1) {
      this.accounts[index] = account
    } else {
      this.accounts.push(account)
    }
    this.setJson(StorageKey.ACCOUNTS, this.accounts)
    return this.accounts
  }

  removeAccount(account: TAccount) {
    this.accounts = this.accounts.filter((act) => !isSameAccount(act, account))
    this.setJson(StorageKey.ACCOUNTS, this.accounts)
    return this.accounts
  }

  switchAccount(account: TAccount | null) {
    if (isSameAccount(this.currentAccount, account)) {
      return
    }
    const act = this.accounts.find((act) => isSameAccount(act, account))
    if (!act) {
      return
    }
    this.currentAccount = act
    this.setJson(StorageKey.CURRENT_ACCOUNT, act)
  }

  getTextOnlyMode() {
    return this.textOnlyMode
  }

  setTextOnlyMode(enabled: boolean) {
    this.textOnlyMode = enabled
    this.setBoolean(StorageKey.TEXT_ONLY_MODE, enabled)
  }

  getLowBandwidthMode() {
    return this.lowBandwidthMode
  }

  setLowBandwidthMode(enabled: boolean) {
    this.lowBandwidthMode = enabled
    this.setBoolean(StorageKey.LOW_BANDWIDTH_MODE, enabled)
  }

  getDisableAvatarAnimations() {
    return this.disableAvatarAnimations
  }

  setDisableAvatarAnimations(enabled: boolean) {
    this.disableAvatarAnimations = enabled
    this.setBoolean(StorageKey.DISABLE_AVATAR_ANIMATIONS, enabled)
  }

  getReactionFountainEnabled() {
    return this.reactionFountainEnabled
  }

  setReactionFountainEnabled(enabled: boolean) {
    this.reactionFountainEnabled = enabled
    this.setBoolean(StorageKey.REACTION_FOUNTAIN_ENABLED, enabled)
  }

  getLastReadNotificationTime(pubkey: string) {
    return this.lastReadNotificationTimeMap[pubkey] ?? 0
  }

  setLastReadNotificationTime(pubkey: string, time: number) {
    this.lastReadNotificationTimeMap[pubkey] = time
    this.setJson(StorageKey.LAST_READ_NOTIFICATION_TIME_MAP, this.lastReadNotificationTimeMap)
  }

  getFeedInfo(pubkey: string) {
    return this.accountFeedInfoMap[pubkey]
  }

  setFeedInfo(info: TFeedInfo, pubkey?: string | null) {
    this.accountFeedInfoMap[pubkey ?? 'default'] = info
    this.setJson(StorageKey.ACCOUNT_FEED_INFO_MAP, this.accountFeedInfoMap)
  }

  getAutoplay() {
    return this.autoplay
  }

  setAutoplay(autoplay: boolean) {
    this.autoplay = autoplay
    this.setBoolean(StorageKey.AUTOPLAY, autoplay)
  }

  getHideUntrustedInteractions() {
    return this.hideUntrustedInteractions
  }

  setHideUntrustedInteractions(hideUntrustedInteractions: boolean) {
    this.hideUntrustedInteractions = hideUntrustedInteractions
    this.setBoolean(StorageKey.HIDE_UNTRUSTED_INTERACTIONS, hideUntrustedInteractions)
  }

  getHideUntrustedNotifications() {
    return this.hideUntrustedNotifications
  }

  setHideUntrustedNotifications(hideUntrustedNotifications: boolean) {
    this.hideUntrustedNotifications = hideUntrustedNotifications
    this.setBoolean(StorageKey.HIDE_UNTRUSTED_NOTIFICATIONS, hideUntrustedNotifications)
  }

  getHideUntrustedNotes() {
    return this.hideUntrustedNotes
  }

  setHideUntrustedNotes(hideUntrustedNotes: boolean) {
    this.hideUntrustedNotes = hideUntrustedNotes
    this.setBoolean(StorageKey.HIDE_UNTRUSTED_NOTES, hideUntrustedNotes)
  }

  getTrustLevel() {
    return this.trustLevel
  }

  setTrustLevel(trustLevel: number) {
    this.trustLevel = trustLevel
    this.setNumber(StorageKey.TRUST_LEVEL, trustLevel)
  }

  getMediaUploadServiceConfig(pubkey?: string | null): TMediaUploadServiceConfig {
    const defaultConfig = { type: 'nip96', service: this.mediaUploadService } as const
    if (!pubkey) {
      return defaultConfig
    }
    return this.mediaUploadServiceConfigMap[pubkey] ?? defaultConfig
  }

  setMediaUploadServiceConfig(
    pubkey: string,
    config: TMediaUploadServiceConfig
  ): TMediaUploadServiceConfig {
    this.mediaUploadServiceConfigMap[pubkey] = config
    this.setJson(StorageKey.MEDIA_UPLOAD_SERVICE_CONFIG_MAP, this.mediaUploadServiceConfigMap)
    return config
  }

  getDefaultShowNsfw() {
    return this.defaultShowNsfw
  }

  setDefaultShowNsfw(defaultShowNsfw: boolean) {
    this.defaultShowNsfw = defaultShowNsfw
    this.setBoolean(StorageKey.DEFAULT_SHOW_NSFW, defaultShowNsfw)
  }

  getShowKinds() {
    return this.showKinds
  }

  setShowKinds(kinds: number[]) {
    this.showKinds = kinds
    this.setJson(StorageKey.SHOW_KINDS, kinds)
  }

  getMediaOnly() {
    return this.mediaOnly
  }

  setMediaOnly(mediaOnly: boolean) {
    this.mediaOnly = mediaOnly
    this.setBoolean(StorageKey.MEDIA_ONLY, mediaOnly)
  }

  getHideContentMentioningMutedUsers() {
    return this.hideContentMentioningMutedUsers
  }

  setHideContentMentioningMutedUsers(hide: boolean) {
    this.hideContentMentioningMutedUsers = hide
    this.setBoolean(StorageKey.HIDE_CONTENT_MENTIONING_MUTED_USERS, hide)
  }

  getAlwaysHideMutedNotes() {
    return this.alwaysHideMutedNotes
  }

  setAlwaysHideMutedNotes(hide: boolean) {
    this.alwaysHideMutedNotes = hide
    this.setBoolean(StorageKey.ALWAYS_HIDE_MUTED_NOTES, hide)
  }

  getHideNotificationsFromMutedUsers() {
    return this.hideNotificationsFromMutedUsers
  }

  setHideNotificationsFromMutedUsers(hide: boolean) {
    this.hideNotificationsFromMutedUsers = hide
    this.setBoolean(StorageKey.HIDE_NOTIFICATIONS_FROM_MUTED_USERS, hide)
  }

  getNotificationListStyle() {
    return this.notificationListStyle
  }

  setNotificationListStyle(style: TNotificationStyle) {
    this.notificationListStyle = style
    this.setString(StorageKey.NOTIFICATION_LIST_STYLE, style)
  }

  getMediaAutoLoadPolicy() {
    return this.mediaAutoLoadPolicy
  }

  setMediaAutoLoadPolicy(policy: TMediaAutoLoadPolicy) {
    this.mediaAutoLoadPolicy = policy
    this.setString(StorageKey.MEDIA_AUTO_LOAD_POLICY, policy)
  }

  getMaxHashtags() {
    return this.maxHashtags
  }

  setMaxHashtags(max: number) {
    this.maxHashtags = max
    this.setNumber(StorageKey.MAX_HASHTAGS, max)
  }

  getMaxMentions() {
    return this.maxMentions
  }

  setMaxMentions(max: number) {
    this.maxMentions = max
    this.setNumber(StorageKey.MAX_MENTIONS, max)
  }

  getDistractionFreeMode() {
    return this.distractionFreeMode
  }

  setDistractionFreeMode(mode: TDistractionFreeMode) {
    this.distractionFreeMode = mode
    this.setString(StorageKey.DISTRACTION_FREE_MODE, mode)
  }

  getFontSize() {
    return this.fontSize
  }

  setFontSize(fontSize: number) {
    if (!FONT_SIZES.includes(fontSize as any)) {
      return
    }
    this.fontSize = fontSize
    this.setNumber(StorageKey.FONT_SIZE, fontSize)
  }

  getTitleFontSize() {
    return this.titleFontSize
  }

  setTitleFontSize(titleFontSize: number) {
    if (!TITLE_FONT_SIZES.includes(titleFontSize as any)) {
      return
    }
    this.titleFontSize = titleFontSize
    this.setNumber(StorageKey.TITLE_FONT_SIZE, titleFontSize)
  }

  getFontFamily() {
    return this.fontFamily
  }

  setFontFamily(fontFamily: TFontFamily) {
    if (!Object.keys(FONT_FAMILIES).includes(fontFamily)) {
      return
    }
    this.fontFamily = fontFamily
    this.setString(StorageKey.FONT_FAMILY, fontFamily)
  }

  getPrimaryColor() {
    return this.primaryColor
  }

  setPrimaryColor(color: TPrimaryColor) {
    this.primaryColor = color
    this.setString(StorageKey.PRIMARY_COLOR, color)
  }

  getButtonRadius() {
    return this.buttonRadius
  }

  setButtonRadius(radius: number) {
    if (!BUTTON_RADIUS_VALUES.includes(radius as any)) {
      return
    }
    this.buttonRadius = radius
    this.setNumber(StorageKey.BUTTON_RADIUS, radius)
  }

  getPostButtonStyle() {
    return this.postButtonStyle
  }

  setPostButtonStyle(style: TPostButtonStyle) {
    if (style !== POST_BUTTON_STYLE.FILLED && style !== POST_BUTTON_STYLE.OUTLINED) {
      return
    }
    this.postButtonStyle = style
    this.setString(StorageKey.POST_BUTTON_STYLE, style)
  }

  getCardRadius() {
    return this.cardRadius
  }

  setCardRadius(radius: number) {
    if (!CARD_RADIUS_VALUES.includes(radius as any)) {
      return
    }
    this.cardRadius = radius
    this.setNumber(StorageKey.CARD_RADIUS, radius)
  }

  getMediaRadius() {
    return this.mediaRadius
  }

  setMediaRadius(radius: number) {
    if (!MEDIA_RADIUS_VALUES.includes(radius as any)) {
      return
    }
    this.mediaRadius = radius
    this.setNumber(StorageKey.MEDIA_RADIUS, radius)
  }

  getPageTheme() {
    return this.pageTheme
  }

  setPageTheme(pageTheme: TPageTheme) {
    this.pageTheme = pageTheme
    this.setString(StorageKey.PAGE_THEME, pageTheme)
  }

  getCompactSidebar() {
    return this.compactSidebar
  }

  setCompactSidebar(compact: boolean) {
    this.compactSidebar = compact
    this.setBoolean(StorageKey.COMPACT_SIDEBAR, compact)
  }

  getLogoStyle() {
    return this.logoStyle
  }

  setLogoStyle(style: TLogoStyle) {
    this.logoStyle = style
    this.setString(StorageKey.LOGO_STYLE, style)
  }

  getCustomLogoText() {
    return this.customLogoText
  }

  setCustomLogoText(text: string) {
    this.customLogoText = text
    this.setString(StorageKey.CUSTOM_LOGO_TEXT, text)
  }

  getCustomLogoEmoji() {
    return this.customLogoEmoji
  }

  setCustomLogoEmoji(emoji: string | TEmoji) {
    this.customLogoEmoji = emoji
    this.setJson(StorageKey.CUSTOM_LOGO_EMOJI, emoji)
  }

  getLogoFontSize() {
    return this.logoFontSize
  }

  setLogoFontSize(size: number) {
    this.logoFontSize = size
    this.setNumber(StorageKey.LOGO_FONT_SIZE, size)
  }

  getNewsFeedRelays() {
    return this.newsFeedRelays
  }

  setNewsFeedRelays(relays: string[]) {
    this.newsFeedRelays = relays
    this.setJson(StorageKey.NEWS_WIDGET_RELAYS, relays)
  }

  private getCustomFeedsOwnerKey(pubkey?: string | null) {
    return pubkey ?? this.currentAccount?.pubkey ?? 'default'
  }

  private getLocalPostDraftsOwnerKey(pubkey?: string | null) {
    return pubkey ?? this.currentAccount?.pubkey ?? 'default'
  }

  private sanitizeCustomFeeds(value: unknown): TCustomFeed[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value.filter((feed): feed is TCustomFeed => {
      return (
        !!feed &&
        typeof feed === 'object' &&
        typeof (feed as TCustomFeed).id === 'string' &&
        typeof (feed as TCustomFeed).name === 'string' &&
        typeof (feed as TCustomFeed).searchParams === 'object'
      )
    })
  }

  private persistCustomFeedsForKey(ownerKey: string, feeds: TCustomFeed[]) {
    this.customFeedsMap[ownerKey] = feeds
    this.setJson(StorageKey.CUSTOM_FEEDS, this.customFeedsMap)
  }

  private sanitizeLocalPostDrafts(value: unknown): TLocalPostDraft[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value
      .map((draft) => sanitizeLocalPostDraft(draft))
      .filter((draft): draft is TLocalPostDraft => !!draft)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private persistLocalPostDraftsForKey(ownerKey: string, drafts: TLocalPostDraft[]) {
    this.localPostDraftsMap[ownerKey] = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)
    this.setJson(StorageKey.LOCAL_POST_DRAFTS, this.localPostDraftsMap)
  }

  getCustomFeeds(pubkey?: string | null) {
    return [...(this.customFeedsMap[this.getCustomFeedsOwnerKey(pubkey)] ?? [])]
  }

  addCustomFeed(feed: TCustomFeed, pubkey?: string | null) {
    const ownerKey = this.getCustomFeedsOwnerKey(pubkey)
    const feeds = this.getCustomFeeds(pubkey)
    const index = feeds.findIndex((currentFeed) => currentFeed.id === feed.id)

    if (index !== -1) {
      feeds[index] = feed
    } else {
      feeds.push(feed)
    }

    this.persistCustomFeedsForKey(ownerKey, feeds)
  }

  removeCustomFeed(id: string, pubkey?: string | null) {
    const ownerKey = this.getCustomFeedsOwnerKey(pubkey)
    const feeds = this.getCustomFeeds(pubkey).filter((feed) => feed.id !== id)
    this.persistCustomFeedsForKey(ownerKey, feeds)
  }

  updateCustomFeed(id: string, updates: Partial<TCustomFeed>, pubkey?: string | null) {
    const ownerKey = this.getCustomFeedsOwnerKey(pubkey)
    const feeds = this.getCustomFeeds(pubkey)
    const index = feeds.findIndex((feed) => feed.id === id)
    if (index === -1) {
      return
    }

    feeds[index] = { ...feeds[index], ...updates }
    this.persistCustomFeedsForKey(ownerKey, feeds)
  }

  getLocalPostDrafts(pubkey?: string | null) {
    const ownerKey = this.getLocalPostDraftsOwnerKey(pubkey)
    return cloneSerializable(this.localPostDraftsMap[ownerKey] ?? [])
  }

  saveLocalPostDraft(
    draft: Omit<TLocalPostDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    pubkey?: string | null
  ) {
    const ownerKey = this.getLocalPostDraftsOwnerKey(pubkey)
    const drafts = this.getLocalPostDrafts(pubkey)
    const now = Date.now()
    const draftId = draft.id?.trim() || randomString(12)
    const nextDraft: TLocalPostDraft = {
      id: draftId,
      content: cloneDraftContent(draft.content),
      previewText: typeof draft.previewText === 'string' ? draft.previewText : '',
      images: sanitizeDraftImages(draft.images),
      isNsfw: !!draft.isNsfw,
      isPoll: !!draft.isPoll,
      pollCreateData: normalizePollCreateData(draft.pollCreateData),
      addClientTag: draft.addClientTag ?? true,
      scheduledFor:
        typeof draft.scheduledFor === 'number' && Number.isFinite(draft.scheduledFor)
          ? draft.scheduledFor
          : null,
      minPow: typeof draft.minPow === 'number' && Number.isFinite(draft.minPow) ? draft.minPow : 0,
      createdAt: now,
      updatedAt: now
    }

    const index = drafts.findIndex((item) => item.id === draftId)
    if (index >= 0) {
      nextDraft.createdAt = drafts[index].createdAt
      drafts[index] = nextDraft
    } else {
      drafts.unshift(nextDraft)
    }

    this.persistLocalPostDraftsForKey(ownerKey, drafts)
    return cloneSerializable(nextDraft)
  }

  removeLocalPostDraft(id: string, pubkey?: string | null) {
    const ownerKey = this.getLocalPostDraftsOwnerKey(pubkey)
    const drafts = this.getLocalPostDrafts(pubkey).filter((draft) => draft.id !== id)
    this.persistLocalPostDraftsForKey(ownerKey, drafts)
  }

  getHideReadsInNavigation() {
    return this.hideReadsInNavigation
  }

  setHideReadsInNavigation(hide: boolean) {
    this.hideReadsInNavigation = hide
    this.setBoolean(StorageKey.HIDE_READS_IN_NAVIGATION, hide)
  }

  getHideReadsInProfiles() {
    return this.hideReadsInProfiles
  }

  setHideReadsInProfiles(hide: boolean) {
    this.hideReadsInProfiles = hide
    this.setBoolean(StorageKey.HIDE_READS_IN_PROFILES, hide)
  }

  getFavoriteLists(pubkey?: string | null) {
    const key = pubkey || '_global'
    return this.favoriteListsMap[key] || []
  }

  addFavoriteList(listKey: string, pubkey?: string | null) {
    const key = pubkey || '_global'
    const currentFavorites = this.favoriteListsMap[key] || []
    if (!currentFavorites.includes(listKey)) {
      this.favoriteListsMap[key] = [...currentFavorites, listKey]
      this.setJson(StorageKey.FAVORITE_LISTS, this.favoriteListsMap)
    }
  }

  removeFavoriteList(listKey: string, pubkey?: string | null) {
    const key = pubkey || '_global'
    const currentFavorites = this.favoriteListsMap[key] || []
    this.favoriteListsMap[key] = currentFavorites.filter((k) => k !== listKey)
    this.setJson(StorageKey.FAVORITE_LISTS, this.favoriteListsMap)
  }

  isFavoriteList(listKey: string, pubkey?: string | null) {
    const key = pubkey || '_global'
    const currentFavorites = this.favoriteListsMap[key] || []
    return currentFavorites.includes(listKey)
  }

  // Read Articles
  isArticleRead(articleId: string) {
    return this.readArticles.has(articleId)
  }

  markArticleAsRead(articleId: string) {
    if (this.readArticles.has(articleId)) {
      return
    }
    this.readArticles.add(articleId)
    this.setJson(StorageKey.READ_ARTICLES, Array.from(this.readArticles))
  }

  markArticleAsUnread(articleId: string) {
    if (!this.readArticles.has(articleId)) {
      return
    }
    this.readArticles.delete(articleId)
    this.setJson(StorageKey.READ_ARTICLES, Array.from(this.readArticles))
  }

  clearReadArticles() {
    this.readArticles.clear()
    removeStorageItem(StorageKey.READ_ARTICLES)
  }

  // Bookmark Tags
  getBookmarkTags(eventId: string): string[] {
    return this.bookmarkTags[eventId] || []
  }

  setBookmarkTags(eventId: string, tags: string[]) {
    this.bookmarkTags[eventId] = tags
    this.setJson(StorageKey.BOOKMARK_TAGS, this.bookmarkTags)
  }

  addBookmarkTag(eventId: string, tag: string) {
    const currentTags = this.bookmarkTags[eventId] || []
    if (!currentTags.includes(tag)) {
      this.bookmarkTags[eventId] = [...currentTags, tag]
      this.setJson(StorageKey.BOOKMARK_TAGS, this.bookmarkTags)
    }
  }

  removeBookmarkTag(eventId: string, tag: string) {
    const currentTags = this.bookmarkTags[eventId] || []
    this.bookmarkTags[eventId] = currentTags.filter((t) => t !== tag)
    if (this.bookmarkTags[eventId].length === 0) {
      delete this.bookmarkTags[eventId]
    }
    this.setJson(StorageKey.BOOKMARK_TAGS, this.bookmarkTags)
  }

  getAllBookmarkTags(): string[] {
    const allTags = new Set<string>()
    Object.values(this.bookmarkTags).forEach((tags) => {
      tags.forEach((tag) => allTags.add(tag))
    })
    return Array.from(allTags).sort()
  }

  deleteBookmarkTag(tag: string) {
    Object.keys(this.bookmarkTags).forEach((eventId) => {
      this.bookmarkTags[eventId] = this.bookmarkTags[eventId].filter((t) => t !== tag)
      if (this.bookmarkTags[eventId].length === 0) {
        delete this.bookmarkTags[eventId]
      }
    })
    this.setJson(StorageKey.BOOKMARK_TAGS, this.bookmarkTags)
  }

  // Pinned Replies - stores which replies are pinned for each thread
  // Key is the parent event ID, value is array of pinned reply IDs
  getPinnedRepliesForThread(threadId: string): string[] {
    return this.pinnedReplies[threadId] || []
  }

  isReplyPinned(threadId: string, replyId: string): boolean {
    const pinnedReplies = this.pinnedReplies[threadId] || []
    return pinnedReplies.includes(replyId)
  }

  pinReply(threadId: string, replyId: string) {
    const pinnedReplies = this.pinnedReplies[threadId] || []
    if (!pinnedReplies.includes(replyId)) {
      this.pinnedReplies[threadId] = [...pinnedReplies, replyId]
      this.setJson(StorageKey.PINNED_REPLIES, this.pinnedReplies)
    }
  }

  unpinReply(threadId: string, replyId: string) {
    const pinnedReplies = this.pinnedReplies[threadId] || []
    this.pinnedReplies[threadId] = pinnedReplies.filter((id) => id !== replyId)
    if (this.pinnedReplies[threadId].length === 0) {
      delete this.pinnedReplies[threadId]
    }
    this.setJson(StorageKey.PINNED_REPLIES, this.pinnedReplies)
  }

  clearPinnedRepliesForThread(threadId: string) {
    delete this.pinnedReplies[threadId]
    this.setJson(StorageKey.PINNED_REPLIES, this.pinnedReplies)
  }

  // Menu Items - stores custom order and visibility of navigation menu items
  getMenuItems() {
    const storedItems = getStorageItem(StorageKey.MENU_ITEMS)

    if (!storedItems) {
      setStorageBoolean(StorageKey.LIVE_STREAMS_MENU_MIGRATION, true)
      // Return default menu items if nothing stored
      return getDefaultMenuItems()
    }

    const stored = JSON.parse(storedItems) as TMenuItemConfig[]

    const mergedItems = migrateLegacyMessagesMenuPosition(mergeMenuItemsWithDefaults(stored))
    if (JSON.stringify(mergedItems) !== storedItems) {
      this.setMenuItems(mergedItems)
    }

    const liveStreamsMigrationDone =
      getStorageItem(StorageKey.LIVE_STREAMS_MENU_MIGRATION) === 'true'

    if (!liveStreamsMigrationDone) {
      const migratedItems = mergedItems.map((item) =>
        item.id === 'livestreams' ? { ...item, visible: true } : item
      )
      this.setMenuItems(migratedItems)
      setStorageBoolean(StorageKey.LIVE_STREAMS_MENU_MIGRATION, true)
      return migratedItems
    }

    return mergedItems
  }

  setMenuItems(menuItems: TMenuItemConfig[]) {
    this.setJson(StorageKey.MENU_ITEMS, menuItems)
  }

  getDefaultReactionEmojis() {
    return this.defaultReactionEmojis
  }

  setDefaultReactionEmojis(emojis: string[]) {
    this.defaultReactionEmojis = emojis
    this.setJson(StorageKey.DEFAULT_REACTION_EMOJIS, emojis)
  }

  getReactionOptionsEnabled() {
    return this.reactionOptionsEnabled
  }

  setReactionOptionsEnabled(enabled: boolean) {
    this.reactionOptionsEnabled = enabled
    this.setBoolean(StorageKey.REACTION_OPTIONS_ENABLED, enabled)
  }
}

const instance = new LocalStorageService()
export default instance

function sanitizeLocalPostDraft(value: unknown): TLocalPostDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const draft = value as Partial<TLocalPostDraft>
  const id = typeof draft.id === 'string' ? draft.id.trim() : ''
  if (!id) {
    return null
  }

  return {
    id,
    content: cloneDraftContent(draft.content),
    previewText: typeof draft.previewText === 'string' ? draft.previewText : '',
    images: sanitizeDraftImages(draft.images),
    isNsfw: !!draft.isNsfw,
    isPoll: !!draft.isPoll,
    pollCreateData: normalizePollCreateData(draft.pollCreateData),
    addClientTag: draft.addClientTag ?? true,
    scheduledFor:
      typeof draft.scheduledFor === 'number' && Number.isFinite(draft.scheduledFor)
        ? draft.scheduledFor
        : null,
    minPow: typeof draft.minPow === 'number' && Number.isFinite(draft.minPow) ? draft.minPow : 0,
    createdAt:
      typeof draft.createdAt === 'number' && Number.isFinite(draft.createdAt)
        ? draft.createdAt
        : Date.now(),
    updatedAt:
      typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt)
        ? draft.updatedAt
        : Date.now()
  }
}

function sanitizeDraftImages(value: unknown): { url: string; alt?: string }[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((image) => {
    if (!image || typeof image !== 'object') {
      return []
    }

    const url =
      typeof (image as { url?: unknown }).url === 'string' ? (image as { url: string }).url : ''
    if (!url.trim()) {
      return []
    }

    const alt =
      typeof (image as { alt?: unknown }).alt === 'string'
        ? (image as { alt: string }).alt
        : undefined

    return [{ url, ...(alt ? { alt } : {}) }]
  })
}

function cloneDraftContent(value: unknown): JSONContent | string {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  return cloneSerializable(value as JSONContent)
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
