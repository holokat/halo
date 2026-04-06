import {
  BUTTON_RADIUS_VALUES,
  CARD_RADIUS_VALUES,
  MEDIA_RADIUS_VALUES,
  DEFAULT_BUTTON_RADIUS,
  DEFAULT_CARD_RADIUS,
  DEFAULT_MEDIA_RADIUS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_NEWS_WIDGET_RELAYS,
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
  StorageKey,
  TZapSound,
  ZAP_SOUNDS
} from '@/constants'
import { isSameAccount } from '@/lib/account'
import { randomString } from '@/lib/random'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import {
  TAccount,
  TAccountPointer,
  TAIServiceConfig,
  TAIToolsConfig,
  TCustomFeed,
  TDistractionFreeMode,
  TFeedInfo,
  TFontFamily,
  TMediaAutoLoadPolicy,
  TMediaUploadServiceConfig,
  TNoteListMode,
  TNotificationStyle,
  TPageTheme,
  TPostButtonStyle,
  TPrimaryColor,
  TRelaySet,
  TThemeSetting,
  TTranslationServiceConfig,
  TColorPalette,
  TEmoji,
  TLogoStyle
} from '@/types'
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
  private lastReadMessageTimeMap: Record<string, number> = {}
  private messageConversationReadTimeMap: Record<string, Record<string, number>> = {}
  private dismissedMessageConversationMap: Record<string, Record<string, number>> = {}
  private defaultZapSats: number = 21
  private defaultZapComment: string = 'Zap!'
  private quickZap: boolean = false
  private accountFeedInfoMap: Record<string, TFeedInfo | undefined> = {}
  private mediaUploadService: string = DEFAULT_NIP_96_SERVICE
  private autoplay: boolean = true
  private hideUntrustedInteractions: boolean = false
  private hideUntrustedNotifications: boolean = false
  private hideUntrustedNotes: boolean = false
  private trustLevel: number = 0 // 0: Everyone, 1: Network + Follows, 2: Follows only, 3: You only
  private translationServiceConfigMap: Record<string, TTranslationServiceConfig> = {}
  private mediaUploadServiceConfigMap: Record<string, TMediaUploadServiceConfig> = {}
  private aiServiceConfigMap: Record<string, TAIServiceConfig> = {}
  private aiToolsConfigMap: Record<string, TAIToolsConfig> = {}
  private defaultShowNsfw: boolean = false
  private dismissedTooManyRelaysAlert: boolean = false
  private showKinds: number[] = []
  private mediaOnly: boolean = true
  private hideContentMentioningMutedUsers: boolean = false
  private alwaysHideMutedNotes: boolean = false
  private hideNotificationsFromMutedUsers: boolean = false
  private notificationListStyle: TNotificationStyle = NOTIFICATION_LIST_STYLE.COMPACT
  private mediaAutoLoadPolicy: TMediaAutoLoadPolicy = MEDIA_AUTO_LOAD_POLICY.ALWAYS
  private shownCreateWalletGuideToastPubkeys: Set<string> = new Set()
  private fontSize: number = DEFAULT_FONT_SIZE
  private titleFontSize: number = DEFAULT_TITLE_FONT_SIZE
  private fontFamily: TFontFamily = DEFAULT_FONT_FAMILY
  private primaryColor: TPrimaryColor = DEFAULT_PRIMARY_COLOR
  private buttonRadius: number = DEFAULT_BUTTON_RADIUS
  private postButtonStyle: TPostButtonStyle = DEFAULT_POST_BUTTON_STYLE
  private cardRadius: number = DEFAULT_CARD_RADIUS
  private mediaRadius: number = DEFAULT_MEDIA_RADIUS
  private pageTheme: TPageTheme = DEFAULT_PAGE_THEME
  private trendingNotesDismissed: boolean = false
  private compactSidebar: boolean = false
  private logoStyle: TLogoStyle = 'image'
  private customLogoText: string = 'x21'
  private customLogoEmoji: string | TEmoji = '⚡'
  private logoFontSize: number = DEFAULT_LOGO_FONT_SIZE
  private widgetSidebarTitle: string = 'Widgets'
  private maxHashtags: number = 3
  private maxMentions: number = 0
  private widgetSidebarIcon: string | null = null
  private hideWidgetTitles: boolean = false
  private enabledWidgets: string[] = []
  private collapsedWidgets: string[] = []
  private widgetHeights: Record<string, number> = {}
  private pinnedNoteWidgets: { id: string; eventId: string }[] = []
  private liveStreamWidgets: {
    id: string
    naddr: string
    streamingUrl: string
    title: string
    image?: string
  }[] = []
  private aiPromptWidgets: { id: string; eventId: string; messages: any[] }[] = []
  private trendingNotesHeight: 'short' | 'medium' | 'tall' | 'remaining' = 'medium'
  private bitcoinTickerAlignment: 'left' | 'center' = 'left'
  private bitcoinTickerTextSize: 'large' | 'small' = 'large'
  private bitcoinTickerShowBlockHeight: boolean = false
  private bitcoinTickerShowSatsMode: boolean = false
  private stockTrackerSymbols: string[] = []
  private newsWidgetRelays: string[] = DEFAULT_NEWS_WIDGET_RELAYS
  private newsWidgetHashtags: string[] = []
  private zapSound: TZapSound = ZAP_SOUNDS.NONE
  private customFeeds: TCustomFeed[] = []
  private chargeZapEnabled: boolean = false
  private chargeZapLimit: number = 1000
  private zapOnReactions: boolean = false
  private onlyZapsMode: boolean = false
  private distractionFreeMode: TDistractionFreeMode = DISTRACTION_FREE_MODE.DRAIN_MY_TIME
  private hideReadsInNavigation: boolean = false
  private hideReadsInProfiles: boolean = false
  private favoriteListsMap: Record<string, string[]> = {}
  private readArticles: Set<string> = new Set()
  private bookmarkTags: Record<string, string[]> = {}
  private pinnedReplies: Record<string, string[]> = {}
  private paymentsEnabled: boolean = false
  private textOnlyMode: boolean = false
  private lowBandwidthMode: boolean = false
  private disableAvatarAnimations: boolean = false
  private messageNotificationsEnabled: boolean = true
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
    this.initWidgetState()
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
    this.lastReadMessageTimeMap = readStoredJson<Record<string, number>>(
      StorageKey.LAST_READ_MESSAGE_TIME_MAP,
      {}
    )
    this.messageConversationReadTimeMap = readStoredJson<Record<string, Record<string, number>>>(
      StorageKey.MESSAGE_CONVERSATION_READ_TIME_MAP,
      {}
    )
    this.dismissedMessageConversationMap = readStoredJson<Record<string, Record<string, number>>>(
      StorageKey.DISMISSED_MESSAGE_CONVERSATION_MAP,
      {}
    )
    this.relaySets = this.loadRelaySets()

    const defaultZapSatsStr = readStoredStringValue(StorageKey.DEFAULT_ZAP_SATS)
    if (defaultZapSatsStr) {
      const num = parseInt(defaultZapSatsStr, 10)
      if (!isNaN(num)) {
        this.defaultZapSats = num
      }
    }
    this.defaultZapComment = readStoredString(StorageKey.DEFAULT_ZAP_COMMENT, 'Zap!')
    this.quickZap = readStoredBoolean(StorageKey.QUICK_ZAP)
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

    this.translationServiceConfigMap = readStoredJson<Record<string, TTranslationServiceConfig>>(
      StorageKey.TRANSLATION_SERVICE_CONFIG_MAP,
      {}
    )
    this.mediaUploadServiceConfigMap = readStoredJson<Record<string, TMediaUploadServiceConfig>>(
      StorageKey.MEDIA_UPLOAD_SERVICE_CONFIG_MAP,
      {}
    )
    this.aiServiceConfigMap = readStoredJson<Record<string, TAIServiceConfig>>(
      StorageKey.AI_SERVICE_CONFIG_MAP,
      {}
    )
    this.aiToolsConfigMap = readStoredJson<Record<string, TAIToolsConfig>>(
      StorageKey.AI_TOOLS_CONFIG_MAP,
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
    this.dismissedTooManyRelaysAlert = readStoredBoolean(StorageKey.DISMISSED_TOO_MANY_RELAYS_ALERT)

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
      if (showKindsVersion < 2 && showKinds.includes(ExtendedKind.POLL)) {
        showKinds.push(ExtendedKind.LEGACY_ZAP_POLL)
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
    this.shownCreateWalletGuideToastPubkeys = new Set(
      readStoredJson<string[]>(StorageKey.SHOWN_CREATE_WALLET_GUIDE_TOAST_PUBKEYS, [])
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
    this.trendingNotesDismissed = readStoredBoolean(StorageKey.TRENDING_NOTES_DISMISSED)
    this.compactSidebar = readStoredBoolean(StorageKey.COMPACT_SIDEBAR)
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

    const widgetSidebarTitle = readStoredStringValue(StorageKey.WIDGET_SIDEBAR_TITLE)
    if (widgetSidebarTitle) {
      this.widgetSidebarTitle = widgetSidebarTitle
    }

    const widgetSidebarIcon = readStoredStringValue(StorageKey.WIDGET_SIDEBAR_ICON)
    if (widgetSidebarIcon) {
      this.widgetSidebarIcon = widgetSidebarIcon
    }

    const hideWidgetTitles = readStoredStringValue(StorageKey.HIDE_WIDGET_TITLES)
    if (hideWidgetTitles) {
      this.hideWidgetTitles = hideWidgetTitles === 'true'
    }
  }

  private initWidgetState() {
    const enabledWidgetsStr = readStoredStringValue(StorageKey.ENABLED_WIDGETS)
    if (enabledWidgetsStr) {
      this.enabledWidgets = JSON.parse(enabledWidgetsStr)
    } else {
      // Default to trending notes and invite widget enabled for new users.
      this.enabledWidgets = ['trending-notes', 'invite']
      window.localStorage.setItem(StorageKey.ENABLED_WIDGETS, JSON.stringify(this.enabledWidgets))
    }

    const collapsedWidgets = readStoredJson<string[]>(StorageKey.COLLAPSED_WIDGETS, [])
    if (Array.isArray(collapsedWidgets)) {
      this.collapsedWidgets = Array.from(
        new Set(
          collapsedWidgets.filter(
            (widgetId): widgetId is string =>
              typeof widgetId === 'string' && widgetId.trim().length > 0
          )
        )
      )
    }

    this.widgetHeights = sanitizeWidgetHeights(
      readStoredJson<Record<string, number>>(StorageKey.WIDGET_HEIGHTS, {})
    )

    const pinnedNoteWidgetsStr = readStoredStringValue(StorageKey.PINNED_NOTE_WIDGETS)
    if (pinnedNoteWidgetsStr) {
      this.pinnedNoteWidgets = JSON.parse(pinnedNoteWidgetsStr)
    }

    const liveStreamWidgetsStr = readStoredStringValue(StorageKey.LIVE_STREAM_WIDGETS)
    if (liveStreamWidgetsStr) {
      this.liveStreamWidgets = JSON.parse(liveStreamWidgetsStr)
    }

    // AI Prompt widgets are session-only and should not persist across page reloads.
    this.aiPromptWidgets = []
    window.localStorage.removeItem(StorageKey.AI_PROMPT_WIDGETS)

    this.trendingNotesHeight = readStoredEnum(
      StorageKey.TRENDING_NOTES_HEIGHT,
      ['short', 'medium', 'tall', 'remaining'] as const,
      'medium'
    )
    this.bitcoinTickerAlignment = readStoredEnum(
      StorageKey.BITCOIN_TICKER_ALIGNMENT,
      ['left', 'center'] as const,
      'left'
    )
    this.bitcoinTickerTextSize = readStoredEnum(
      StorageKey.BITCOIN_TICKER_TEXT_SIZE,
      ['large', 'small'] as const,
      'large'
    )

    const bitcoinTickerShowBlockHeight = readStoredBooleanValue(
      StorageKey.BITCOIN_TICKER_SHOW_BLOCK_HEIGHT
    )
    if (bitcoinTickerShowBlockHeight !== null) {
      this.bitcoinTickerShowBlockHeight = bitcoinTickerShowBlockHeight
    }

    const bitcoinTickerShowSatsMode = readStoredBooleanValue(
      StorageKey.BITCOIN_TICKER_SHOW_SATS_MODE
    )
    if (bitcoinTickerShowSatsMode !== null) {
      this.bitcoinTickerShowSatsMode = bitcoinTickerShowSatsMode
    }

    const stockTrackerSymbols = readStoredJson<string[]>(StorageKey.STOCK_TRACKER_SYMBOLS, [])
    if (Array.isArray(stockTrackerSymbols)) {
      this.stockTrackerSymbols = stockTrackerSymbols.filter((symbol) => typeof symbol === 'string')
    }

    this.newsWidgetRelays = readStoredStringArray(
      StorageKey.NEWS_WIDGET_RELAYS,
      DEFAULT_NEWS_WIDGET_RELAYS,
      (relay) => {
        const normalizedRelay = normalizeUrl(relay)
        return normalizedRelay && isWebsocketUrl(normalizedRelay) ? normalizedRelay : null
      }
    )
    this.newsWidgetHashtags = readStoredStringArray(
      StorageKey.NEWS_WIDGET_HASHTAGS,
      [],
      normalizeWidgetHashtag
    )

    const zapSound = readStoredStringValue(StorageKey.ZAP_SOUND)
    if (zapSound && Object.values(ZAP_SOUNDS).includes(zapSound as TZapSound)) {
      this.zapSound = zapSound as TZapSound
    }

    const customFeedsStr = readStoredStringValue(StorageKey.CUSTOM_FEEDS)
    if (customFeedsStr) {
      this.customFeeds = JSON.parse(customFeedsStr)
    }

    this.chargeZapEnabled = readStoredBoolean(StorageKey.CHARGE_ZAP_ENABLED)

    const chargeZapLimitStr = readStoredStringValue(StorageKey.CHARGE_ZAP_LIMIT)
    if (chargeZapLimitStr) {
      const num = parseInt(chargeZapLimitStr, 10)
      if (!isNaN(num) && num > 0) {
        this.chargeZapLimit = num
      }
    }

    this.zapOnReactions = readStoredBoolean(StorageKey.ZAP_ON_REACTIONS)
    this.onlyZapsMode = readStoredBoolean(StorageKey.ONLY_ZAPS_MODE)
    this.paymentsEnabled = readStoredBoolean(StorageKey.PAYMENTS_ENABLED)
    this.textOnlyMode = readStoredBoolean(StorageKey.TEXT_ONLY_MODE)
    this.lowBandwidthMode = readStoredBoolean(StorageKey.LOW_BANDWIDTH_MODE)
    this.disableAvatarAnimations = readStoredBoolean(StorageKey.DISABLE_AVATAR_ANIMATIONS)
    this.messageNotificationsEnabled =
      readStoredBooleanValue(StorageKey.MESSAGE_NOTIFICATIONS_ENABLED) ?? true
    this.distractionFreeMode = readStoredEnum(
      StorageKey.DISTRACTION_FREE_MODE,
      Object.values(DISTRACTION_FREE_MODE) as TDistractionFreeMode[],
      DISTRACTION_FREE_MODE.DRAIN_MY_TIME
    )
  }

  private initCollectionState() {
    this.hideReadsInNavigation = readStoredBoolean(StorageKey.HIDE_READS_IN_NAVIGATION)
    this.hideReadsInProfiles = readStoredBoolean(StorageKey.HIDE_READS_IN_PROFILES)

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

  getDefaultZapSats() {
    return this.defaultZapSats
  }

  setDefaultZapSats(sats: number) {
    this.defaultZapSats = sats
    this.setNumber(StorageKey.DEFAULT_ZAP_SATS, sats)
  }

  getDefaultZapComment() {
    return this.defaultZapComment
  }

  setDefaultZapComment(comment: string) {
    this.defaultZapComment = comment
    this.setString(StorageKey.DEFAULT_ZAP_COMMENT, comment)
  }

  getQuickZap() {
    return this.quickZap
  }

  setQuickZap(quickZap: boolean) {
    this.quickZap = quickZap
    this.setBoolean(StorageKey.QUICK_ZAP, quickZap)
  }

  getChargeZapEnabled() {
    return this.chargeZapEnabled
  }

  setChargeZapEnabled(enabled: boolean) {
    this.chargeZapEnabled = enabled
    this.setBoolean(StorageKey.CHARGE_ZAP_ENABLED, enabled)
  }

  getChargeZapLimit() {
    return this.chargeZapLimit
  }

  setChargeZapLimit(limit: number) {
    this.chargeZapLimit = limit
    this.setNumber(StorageKey.CHARGE_ZAP_LIMIT, limit)
  }

  getPaymentsEnabled() {
    return this.paymentsEnabled
  }

  setPaymentsEnabled(enabled: boolean) {
    this.paymentsEnabled = enabled
    this.setBoolean(StorageKey.PAYMENTS_ENABLED, enabled)
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

  getMessageNotificationsEnabled() {
    return this.messageNotificationsEnabled
  }

  setMessageNotificationsEnabled(enabled: boolean) {
    this.messageNotificationsEnabled = enabled
    this.setBoolean(StorageKey.MESSAGE_NOTIFICATIONS_ENABLED, enabled)
  }

  getLastReadNotificationTime(pubkey: string) {
    return this.lastReadNotificationTimeMap[pubkey] ?? 0
  }

  setLastReadNotificationTime(pubkey: string, time: number) {
    this.lastReadNotificationTimeMap[pubkey] = time
    this.setJson(StorageKey.LAST_READ_NOTIFICATION_TIME_MAP, this.lastReadNotificationTimeMap)
  }

  getLastReadMessageTime(pubkey: string) {
    return this.lastReadMessageTimeMap[pubkey] ?? 0
  }

  setLastReadMessageTime(pubkey: string, time: number) {
    this.lastReadMessageTimeMap[pubkey] = time
    this.setJson(StorageKey.LAST_READ_MESSAGE_TIME_MAP, this.lastReadMessageTimeMap)
  }

  getMessageConversationReadTimeMap(pubkey: string) {
    return { ...(this.messageConversationReadTimeMap[pubkey] ?? {}) }
  }

  setMessageConversationReadTime(pubkey: string, conversationId: string, time: number) {
    const nextMap = {
      ...(this.messageConversationReadTimeMap[pubkey] ?? {}),
      [conversationId]: time
    }
    this.messageConversationReadTimeMap[pubkey] = nextMap
    this.setJson(StorageKey.MESSAGE_CONVERSATION_READ_TIME_MAP, this.messageConversationReadTimeMap)
  }

  getDismissedMessageConversationMap(pubkey: string) {
    return { ...(this.dismissedMessageConversationMap[pubkey] ?? {}) }
  }

  setDismissedMessageConversationTime(pubkey: string, conversationId: string, time: number) {
    const nextMap = {
      ...(this.dismissedMessageConversationMap[pubkey] ?? {}),
      [conversationId]: time
    }
    this.dismissedMessageConversationMap[pubkey] = nextMap
    this.setJson(
      StorageKey.DISMISSED_MESSAGE_CONVERSATION_MAP,
      this.dismissedMessageConversationMap
    )
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

  getTranslationServiceConfig(pubkey?: string | null) {
    return this.translationServiceConfigMap[pubkey ?? '_'] ?? { service: 'jumble' }
  }

  setTranslationServiceConfig(config: TTranslationServiceConfig, pubkey?: string | null) {
    this.translationServiceConfigMap[pubkey ?? '_'] = config
    this.setJson(StorageKey.TRANSLATION_SERVICE_CONFIG_MAP, this.translationServiceConfigMap)
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

  getDismissedTooManyRelaysAlert() {
    return this.dismissedTooManyRelaysAlert
  }

  setDismissedTooManyRelaysAlert(dismissed: boolean) {
    this.dismissedTooManyRelaysAlert = dismissed
    this.setBoolean(StorageKey.DISMISSED_TOO_MANY_RELAYS_ALERT, dismissed)
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

  hasShownCreateWalletGuideToast(pubkey: string) {
    return this.shownCreateWalletGuideToastPubkeys.has(pubkey)
  }

  markCreateWalletGuideToastAsShown(pubkey: string) {
    if (this.shownCreateWalletGuideToastPubkeys.has(pubkey)) {
      return
    }
    this.shownCreateWalletGuideToastPubkeys.add(pubkey)
    this.setJson(
      StorageKey.SHOWN_CREATE_WALLET_GUIDE_TOAST_PUBKEYS,
      Array.from(this.shownCreateWalletGuideToastPubkeys)
    )
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

  getTrendingNotesDismissed() {
    return this.trendingNotesDismissed
  }

  setTrendingNotesDismissed(dismissed: boolean) {
    this.trendingNotesDismissed = dismissed
    this.setBoolean(StorageKey.TRENDING_NOTES_DISMISSED, dismissed)
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

  getWidgetSidebarTitle() {
    return this.widgetSidebarTitle
  }

  setWidgetSidebarTitle(title: string) {
    this.widgetSidebarTitle = title
    this.setString(StorageKey.WIDGET_SIDEBAR_TITLE, title)
  }

  getWidgetSidebarIcon() {
    return this.widgetSidebarIcon
  }

  setWidgetSidebarIcon(icon: string | null) {
    this.widgetSidebarIcon = icon
    if (icon === null) {
      removeStorageItem(StorageKey.WIDGET_SIDEBAR_ICON)
    } else {
      this.setString(StorageKey.WIDGET_SIDEBAR_ICON, icon)
    }
  }

  getHideWidgetTitles() {
    return this.hideWidgetTitles
  }

  setHideWidgetTitles(hide: boolean) {
    this.hideWidgetTitles = hide
    this.setBoolean(StorageKey.HIDE_WIDGET_TITLES, hide)
  }

  getEnabledWidgets() {
    return this.enabledWidgets
  }

  setEnabledWidgets(widgets: string[]) {
    this.enabledWidgets = widgets
    this.setJson(StorageKey.ENABLED_WIDGETS, widgets)
  }

  getCollapsedWidgets() {
    return this.collapsedWidgets
  }

  setCollapsedWidgets(widgets: string[]) {
    this.collapsedWidgets = Array.from(
      new Set(
        widgets.filter(
          (widgetId): widgetId is string =>
            typeof widgetId === 'string' && widgetId.trim().length > 0
        )
      )
    )
    this.setJson(StorageKey.COLLAPSED_WIDGETS, this.collapsedWidgets)
  }

  getWidgetHeights() {
    return this.widgetHeights
  }

  setWidgetHeights(heights: Record<string, number>) {
    this.widgetHeights = sanitizeWidgetHeights(heights)
    this.setJson(StorageKey.WIDGET_HEIGHTS, this.widgetHeights)
  }

  getWidgetHeight(widgetId: string) {
    return this.widgetHeights[widgetId]
  }

  setWidgetHeight(widgetId: string, height: number) {
    const normalizedHeight = normalizeWidgetHeight(height)
    if (!widgetId || normalizedHeight === null) {
      return
    }

    this.widgetHeights = {
      ...this.widgetHeights,
      [widgetId]: normalizedHeight
    }
    this.setJson(StorageKey.WIDGET_HEIGHTS, this.widgetHeights)
  }

  clearWidgetHeight(widgetId: string) {
    if (!widgetId || !(widgetId in this.widgetHeights)) {
      return
    }

    const nextHeights = { ...this.widgetHeights }
    delete nextHeights[widgetId]
    this.widgetHeights = nextHeights
    this.setJson(StorageKey.WIDGET_HEIGHTS, this.widgetHeights)
  }

  getTrendingNotesHeight() {
    return this.trendingNotesHeight
  }

  setTrendingNotesHeight(height: 'short' | 'medium' | 'tall' | 'remaining') {
    this.trendingNotesHeight = height
    this.setString(StorageKey.TRENDING_NOTES_HEIGHT, height)
  }

  getBitcoinTickerAlignment() {
    return this.bitcoinTickerAlignment
  }

  setBitcoinTickerAlignment(alignment: 'left' | 'center') {
    this.bitcoinTickerAlignment = alignment
    this.setString(StorageKey.BITCOIN_TICKER_ALIGNMENT, alignment)
  }

  getBitcoinTickerTextSize() {
    return this.bitcoinTickerTextSize
  }

  setBitcoinTickerTextSize(size: 'large' | 'small') {
    this.bitcoinTickerTextSize = size
    this.setString(StorageKey.BITCOIN_TICKER_TEXT_SIZE, size)
  }

  getBitcoinTickerShowBlockHeight() {
    return this.bitcoinTickerShowBlockHeight
  }

  setBitcoinTickerShowBlockHeight(show: boolean) {
    this.bitcoinTickerShowBlockHeight = show
    this.setBoolean(StorageKey.BITCOIN_TICKER_SHOW_BLOCK_HEIGHT, show)
  }

  getBitcoinTickerShowSatsMode() {
    return this.bitcoinTickerShowSatsMode
  }

  setBitcoinTickerShowSatsMode(show: boolean) {
    this.bitcoinTickerShowSatsMode = show
    this.setBoolean(StorageKey.BITCOIN_TICKER_SHOW_SATS_MODE, show)
  }

  getStockTrackerSymbols() {
    return this.stockTrackerSymbols
  }

  setStockTrackerSymbols(symbols: string[]) {
    this.stockTrackerSymbols = symbols
    this.setJson(StorageKey.STOCK_TRACKER_SYMBOLS, symbols)
  }

  getNewsWidgetRelays() {
    return this.newsWidgetRelays
  }

  setNewsWidgetRelays(relays: string[]) {
    this.newsWidgetRelays = relays
    this.setJson(StorageKey.NEWS_WIDGET_RELAYS, relays)
  }

  getNewsWidgetHashtags() {
    return this.newsWidgetHashtags
  }

  setNewsWidgetHashtags(hashtags: string[]) {
    this.newsWidgetHashtags = hashtags
    this.setJson(StorageKey.NEWS_WIDGET_HASHTAGS, hashtags)
  }

  getPinnedNoteWidgets() {
    return this.pinnedNoteWidgets
  }

  setPinnedNoteWidgets(widgets: { id: string; eventId: string }[]) {
    this.pinnedNoteWidgets = widgets
    this.setJson(StorageKey.PINNED_NOTE_WIDGETS, widgets)
  }

  addPinnedNoteWidget(eventId: string) {
    const id = `pinned-note-${Date.now()}`
    this.pinnedNoteWidgets.push({ id, eventId })
    this.setJson(StorageKey.PINNED_NOTE_WIDGETS, this.pinnedNoteWidgets)
    return id
  }

  removePinnedNoteWidget(id: string) {
    this.pinnedNoteWidgets = this.pinnedNoteWidgets.filter((widget) => widget.id !== id)
    this.setJson(StorageKey.PINNED_NOTE_WIDGETS, this.pinnedNoteWidgets)
  }

  getLiveStreamWidgets() {
    return this.liveStreamWidgets
  }

  setLiveStreamWidgets(
    widgets: { id: string; naddr: string; streamingUrl: string; title: string; image?: string }[]
  ) {
    this.liveStreamWidgets = widgets
    this.setJson(StorageKey.LIVE_STREAM_WIDGETS, widgets)
  }

  addLiveStreamWidget(payload: {
    naddr: string
    streamingUrl: string
    title: string
    image?: string
  }) {
    const id = `live-stream-${Date.now()}`
    this.liveStreamWidgets.push({ id, ...payload })
    this.setJson(StorageKey.LIVE_STREAM_WIDGETS, this.liveStreamWidgets)
    return id
  }

  removeLiveStreamWidget(id: string) {
    this.liveStreamWidgets = this.liveStreamWidgets.filter((widget) => widget.id !== id)
    this.setJson(StorageKey.LIVE_STREAM_WIDGETS, this.liveStreamWidgets)
  }

  getAIPromptWidgets() {
    return this.aiPromptWidgets
  }

  setAIPromptWidgets(widgets: { id: string; eventId: string; messages: any[] }[]) {
    // AI Prompt widgets are session-only, no localStorage persistence
    this.aiPromptWidgets = widgets
  }

  addAIPromptWidget(eventId: string, id?: string) {
    const widgetId = id ?? `ai-prompt-${Date.now()}`
    this.aiPromptWidgets.push({ id: widgetId, eventId, messages: [] })
    // AI Prompt widgets are session-only, no localStorage persistence
    return widgetId
  }

  removeAIPromptWidget(id: string) {
    this.aiPromptWidgets = this.aiPromptWidgets.filter((widget) => widget.id !== id)
    // AI Prompt widgets are session-only, no localStorage persistence
  }

  getZapSound() {
    return this.zapSound
  }

  setZapSound(sound: TZapSound) {
    this.zapSound = sound
    this.setString(StorageKey.ZAP_SOUND, sound)
  }

  getCustomFeeds() {
    return this.customFeeds
  }

  addCustomFeed(feed: TCustomFeed) {
    this.customFeeds.push(feed)
    this.setJson(StorageKey.CUSTOM_FEEDS, this.customFeeds)
  }

  removeCustomFeed(id: string) {
    this.customFeeds = this.customFeeds.filter((feed) => feed.id !== id)
    this.setJson(StorageKey.CUSTOM_FEEDS, this.customFeeds)
  }

  updateCustomFeed(id: string, updates: Partial<TCustomFeed>) {
    const index = this.customFeeds.findIndex((feed) => feed.id === id)
    if (index !== -1) {
      this.customFeeds[index] = { ...this.customFeeds[index], ...updates }
      this.setJson(StorageKey.CUSTOM_FEEDS, this.customFeeds)
    }
  }

  getZapOnReactions() {
    return this.zapOnReactions
  }

  setZapOnReactions(enabled: boolean) {
    this.zapOnReactions = enabled
    this.setBoolean(StorageKey.ZAP_ON_REACTIONS, enabled)
  }

  getOnlyZapsMode() {
    return this.onlyZapsMode
  }

  setOnlyZapsMode(enabled: boolean) {
    this.onlyZapsMode = enabled
    this.setBoolean(StorageKey.ONLY_ZAPS_MODE, enabled)
  }

  getAIServiceConfig(pubkey?: string | null): TAIServiceConfig {
    return (
      this.aiServiceConfigMap[pubkey ?? '_'] ?? {
        provider: 'openrouter'
      }
    )
  }

  setAIServiceConfig(config: TAIServiceConfig, pubkey?: string | null) {
    this.aiServiceConfigMap[pubkey ?? '_'] = config
    this.setJson(StorageKey.AI_SERVICE_CONFIG_MAP, this.aiServiceConfigMap)
  }

  getAIToolsConfig(pubkey?: string | null): TAIToolsConfig {
    return this.aiToolsConfigMap[pubkey ?? '_'] ?? { enableSummary: false }
  }

  setAIToolsConfig(config: TAIToolsConfig, pubkey?: string | null) {
    this.aiToolsConfigMap[pubkey ?? '_'] = config
    this.setJson(StorageKey.AI_TOOLS_CONFIG_MAP, this.aiToolsConfigMap)
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

function normalizeWidgetHashtag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

function sanitizeWidgetHeights(heights: Record<string, number> | null | undefined) {
  if (!heights || typeof heights !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(heights)
      .map(([widgetId, height]) => [widgetId, normalizeWidgetHeight(height)])
      .filter(
        (entry): entry is [string, number] =>
          typeof entry[0] === 'string' && entry[0].trim().length > 0 && entry[1] !== null
      )
  )
}

function normalizeWidgetHeight(height: number) {
  if (!Number.isFinite(height)) {
    return null
  }

  const roundedHeight = Math.round(height)
  if (roundedHeight < 120 || roundedHeight > 1200) {
    return null
  }

  return roundedHeight
}
