import localStorageService from '@/services/local-storage.service'
import { TrendingUp, Bitcoin, LineChart, Newspaper, Sparkles, Users, BarChart3 } from 'lucide-react'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { TAIMessage } from '@/types'
import { isValidStockSymbol, normalizeStockSymbol } from '@/services/stock-quote.service'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'

export type TWidgetId =
  | 'trending-notes'
  | 'news'
  | 'polymarket'
  | 'polls'
  | 'bitcoin-ticker'
  | 'stock-tracker'
  | 'ai-prompt'
  | 'invite'
  | string // Allow dynamic pinned-note-* and ai-prompt-* IDs

export type TTrendingNotesHeight = 'short' | 'medium' | 'tall' | 'remaining'

export type TBitcoinTickerAlignment = 'left' | 'center'
export type TBitcoinTickerTextSize = 'large' | 'small'

export type TWidget = {
  id: TWidgetId
  name: string
  description: string
  defaultEnabled: boolean
  icon: React.ReactNode
}

export type TPinnedNoteWidget = {
  id: string
  eventId: string
}

export type TLiveStreamWidget = {
  id: string
  naddr: string
  streamingUrl: string
  title: string
  image?: string
}

export type TAIPromptWidget = {
  id: string
  eventId: string
  messages: TAIMessage[]
}

export const AVAILABLE_WIDGETS: TWidget[] = [
  {
    id: 'bitcoin-ticker',
    name: 'Bitcoin Ticker',
    description: 'Display real-time Bitcoin price from CoinGecko',
    defaultEnabled: false,
    icon: <Bitcoin className="h-5 w-5" />
  },
  {
    id: 'trending-notes',
    name: 'Trending Notes',
    description: 'Display trending notes from across Nostr',
    defaultEnabled: true,
    icon: <TrendingUp className="h-5 w-5" />
  },
  {
    id: 'news',
    name: 'News',
    description: 'Display a compact relay-powered news feed in your sidebar',
    defaultEnabled: false,
    icon: <Newspaper className="h-5 w-5" />
  },
  {
    id: 'polymarket',
    name: 'Polymarket',
    description: 'Display compact latest prediction markets from Polymarket',
    defaultEnabled: false,
    icon: <div className="text-lg font-semibold leading-none">%</div>
  },
  {
    id: 'polls',
    name: 'Polls',
    description: 'Display compact active and finished polls from people you follow',
    defaultEnabled: false,
    icon: <BarChart3 className="h-5 w-5" />
  },
  {
    id: 'stock-tracker',
    name: 'Stock Tracker',
    description: 'Track a compact watchlist of stock symbols in your sidebar',
    defaultEnabled: false,
    icon: <LineChart className="h-5 w-5" />
  },
  {
    id: 'ai-prompt',
    name: 'AI Prompt',
    description: 'Chat with AI about notes in your sidebar',
    defaultEnabled: false,
    icon: <Sparkles className="h-5 w-5" />
  },
  {
    id: 'invite',
    name: 'Invite Friends',
    description: 'Share your invite link and see who joined through you',
    defaultEnabled: true,
    icon: <Users className="h-5 w-5" />
  }
]

type TWidgetsContext = {
  enabledWidgets: TWidgetId[]
  toggleWidget: (widgetId: TWidgetId) => void
  isWidgetEnabled: (widgetId: TWidgetId) => boolean
  toggleWidgetCollapsed: (widgetId: TWidgetId) => void
  isWidgetCollapsed: (widgetId: TWidgetId) => boolean
  getWidgetHeight: (widgetId: TWidgetId) => number | undefined
  setWidgetHeight: (widgetId: TWidgetId, height: number) => void
  clearWidgetHeight: (widgetId: TWidgetId) => void
  getWidgetById: (widgetId: TWidgetId) => TWidget | undefined
  reorderWidgets: (newOrder: TWidgetId[]) => void
  hideWidgetTitles: boolean
  setHideWidgetTitles: (hide: boolean) => void
  trendingNotesHeight: TTrendingNotesHeight
  setTrendingNotesHeight: (height: TTrendingNotesHeight) => void
  bitcoinTickerAlignment: TBitcoinTickerAlignment
  setBitcoinTickerAlignment: (alignment: TBitcoinTickerAlignment) => void
  bitcoinTickerTextSize: TBitcoinTickerTextSize
  setBitcoinTickerTextSize: (size: TBitcoinTickerTextSize) => void
  bitcoinTickerShowBlockHeight: boolean
  setBitcoinTickerShowBlockHeight: (show: boolean) => void
  bitcoinTickerShowSatsMode: boolean
  setBitcoinTickerShowSatsMode: (show: boolean) => void
  stockTrackerSymbols: string[]
  addStockTrackerSymbol: (symbol: string) => void
  removeStockTrackerSymbol: (symbol: string) => void
  newsWidgetRelays: string[]
  addNewsWidgetRelay: (relay: string) => void
  removeNewsWidgetRelay: (relay: string) => void
  newsWidgetHashtags: string[]
  addNewsWidgetHashtag: (hashtag: string) => void
  removeNewsWidgetHashtag: (hashtag: string) => void
  pinnedNoteWidgets: TPinnedNoteWidget[]
  pinNoteWidget: (eventId: string) => string
  unpinNoteWidget: (widgetId: string) => void
  unpinNoteByEventId: (eventId: string) => void
  isPinned: (eventId: string) => boolean
  liveStreamWidgets: TLiveStreamWidget[]
  pinLiveStreamWidget: (payload: Omit<TLiveStreamWidget, 'id'>) => string
  unpinLiveStreamWidget: (widgetId: string) => void
  unpinLiveStreamByNaddr: (naddr: string) => void
  isLiveStreamPinned: (naddr?: string) => boolean
  aiPromptWidgets: TAIPromptWidget[]
  openAIPrompt: (eventId: string) => string
  closeAIPrompt: (widgetId: string) => void
  closeAIPromptByEventId: (eventId: string) => void
  isAIPromptOpen: (eventId: string) => boolean
  updateAIPromptMessages: (widgetId: string, messages: TAIMessage[]) => void
  getAIPromptWidget: (widgetId: string) => TAIPromptWidget | undefined
}

const WidgetsContext = createContext<TWidgetsContext | undefined>(undefined)

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const [enabledWidgets, setEnabledWidgets] = useState<TWidgetId[]>(() => {
    return localStorageService.getEnabledWidgets() as TWidgetId[]
  })

  const [collapsedWidgetIds, setCollapsedWidgetIds] = useState<TWidgetId[]>(() => {
    return localStorageService.getCollapsedWidgets() as TWidgetId[]
  })

  const [widgetHeights, setWidgetHeightsState] = useState<Record<string, number>>(() => {
    return localStorageService.getWidgetHeights()
  })

  const [pinnedNoteWidgets, setPinnedNoteWidgets] = useState<TPinnedNoteWidget[]>(() => {
    return localStorageService.getPinnedNoteWidgets()
  })

  const [liveStreamWidgets, setLiveStreamWidgets] = useState<TLiveStreamWidget[]>(() => {
    return localStorageService.getLiveStreamWidgets()
  })

  const [aiPromptWidgets, setAIPromptWidgets] = useState<TAIPromptWidget[]>(() => {
    return localStorageService.getAIPromptWidgets()
  })

  const [trendingNotesHeight, setTrendingNotesHeightState] = useState<TTrendingNotesHeight>(() => {
    return localStorageService.getTrendingNotesHeight()
  })

  const [bitcoinTickerAlignment, setBitcoinTickerAlignmentState] = useState<TBitcoinTickerAlignment>(() => {
    return localStorageService.getBitcoinTickerAlignment()
  })

  const [bitcoinTickerTextSize, setBitcoinTickerTextSizeState] = useState<TBitcoinTickerTextSize>(() => {
    return localStorageService.getBitcoinTickerTextSize()
  })

  const [bitcoinTickerShowBlockHeight, setBitcoinTickerShowBlockHeightState] = useState<boolean>(() => {
    return localStorageService.getBitcoinTickerShowBlockHeight()
  })

  const [bitcoinTickerShowSatsMode, setBitcoinTickerShowSatsModeState] = useState<boolean>(() => {
    return localStorageService.getBitcoinTickerShowSatsMode()
  })

  const [stockTrackerSymbols, setStockTrackerSymbolsState] = useState<string[]>(() => {
    return localStorageService.getStockTrackerSymbols()
  })

  const [newsWidgetRelays, setNewsWidgetRelaysState] = useState<string[]>(() => {
    return localStorageService.getNewsWidgetRelays()
  })

  const [newsWidgetHashtags, setNewsWidgetHashtagsState] = useState<string[]>(() => {
    return localStorageService.getNewsWidgetHashtags()
  })

  const [hideWidgetTitles, setHideWidgetTitlesState] = useState<boolean>(() => {
    return localStorageService.getHideWidgetTitles()
  })

  useEffect(() => {
    localStorageService.setEnabledWidgets(enabledWidgets)
  }, [enabledWidgets])

  useEffect(() => {
    localStorageService.setCollapsedWidgets(collapsedWidgetIds)
  }, [collapsedWidgetIds])

  useEffect(() => {
    localStorageService.setWidgetHeights(widgetHeights)
  }, [widgetHeights])

  useEffect(() => {
    localStorageService.setPinnedNoteWidgets(pinnedNoteWidgets)
  }, [pinnedNoteWidgets])

  useEffect(() => {
    localStorageService.setLiveStreamWidgets(liveStreamWidgets)
  }, [liveStreamWidgets])

  // AI Prompt widgets are session-only and don't need to persist to localStorage

  useEffect(() => {
    localStorageService.setTrendingNotesHeight(trendingNotesHeight)
  }, [trendingNotesHeight])

  useEffect(() => {
    localStorageService.setBitcoinTickerAlignment(bitcoinTickerAlignment)
  }, [bitcoinTickerAlignment])

  useEffect(() => {
    localStorageService.setBitcoinTickerTextSize(bitcoinTickerTextSize)
  }, [bitcoinTickerTextSize])

  useEffect(() => {
    localStorageService.setBitcoinTickerShowBlockHeight(bitcoinTickerShowBlockHeight)
  }, [bitcoinTickerShowBlockHeight])

  useEffect(() => {
    localStorageService.setBitcoinTickerShowSatsMode(bitcoinTickerShowSatsMode)
  }, [bitcoinTickerShowSatsMode])

  useEffect(() => {
    localStorageService.setStockTrackerSymbols(stockTrackerSymbols)
  }, [stockTrackerSymbols])

  useEffect(() => {
    localStorageService.setNewsWidgetRelays(newsWidgetRelays)
  }, [newsWidgetRelays])

  useEffect(() => {
    localStorageService.setNewsWidgetHashtags(newsWidgetHashtags)
  }, [newsWidgetHashtags])

  useEffect(() => {
    localStorageService.setHideWidgetTitles(hideWidgetTitles)
  }, [hideWidgetTitles])

  const setHideWidgetTitles = (hide: boolean) => {
    setHideWidgetTitlesState(hide)
  }

  const setTrendingNotesHeight = (height: TTrendingNotesHeight) => {
    setTrendingNotesHeightState(height)
    setWidgetHeightsState((prev) => {
      if (!('trending-notes' in prev)) {
        return prev
      }

      const next = { ...prev }
      delete next['trending-notes']
      return next
    })
  }

  const setBitcoinTickerAlignment = (alignment: TBitcoinTickerAlignment) => {
    setBitcoinTickerAlignmentState(alignment)
  }

  const setBitcoinTickerTextSize = (size: TBitcoinTickerTextSize) => {
    setBitcoinTickerTextSizeState(size)
  }

  const setBitcoinTickerShowBlockHeight = (show: boolean) => {
    setBitcoinTickerShowBlockHeightState(show)
  }

  const setBitcoinTickerShowSatsMode = (show: boolean) => {
    setBitcoinTickerShowSatsModeState(show)
  }

  const addStockTrackerSymbol = (rawSymbol: string) => {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!isValidStockSymbol(symbol)) {
      return
    }

    setStockTrackerSymbolsState((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]))
  }

  const removeStockTrackerSymbol = (rawSymbol: string) => {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!symbol) {
      return
    }

    setStockTrackerSymbolsState((prev) => prev.filter((item) => item !== symbol))
  }

  const addNewsWidgetRelay = (rawRelay: string) => {
    const relay = normalizeUrl(rawRelay)
    if (!relay || !isWebsocketUrl(relay)) {
      return
    }

    setNewsWidgetRelaysState((prev) => (prev.includes(relay) ? prev : [...prev, relay]))
  }

  const removeNewsWidgetRelay = (rawRelay: string) => {
    const relay = normalizeUrl(rawRelay)
    if (!relay) {
      return
    }

    setNewsWidgetRelaysState((prev) => prev.filter((item) => item !== relay))
  }

  const addNewsWidgetHashtag = (rawHashtag: string) => {
    const hashtag = normalizeWidgetHashtag(rawHashtag)
    if (!hashtag) {
      return
    }

    setNewsWidgetHashtagsState((prev) => (prev.includes(hashtag) ? prev : [...prev, hashtag]))
  }

  const removeNewsWidgetHashtag = (rawHashtag: string) => {
    const hashtag = normalizeWidgetHashtag(rawHashtag)
    if (!hashtag) {
      return
    }

    setNewsWidgetHashtagsState((prev) => prev.filter((item) => item !== hashtag))
  }

  const toggleWidget = (widgetId: TWidgetId) => {
    setEnabledWidgets((prev) => {
      if (prev.includes(widgetId)) {
        return prev.filter((id) => id !== widgetId)
      } else {
        return [...prev, widgetId]
      }
    })
  }

  const isWidgetEnabled = (widgetId: TWidgetId) => {
    return enabledWidgets.includes(widgetId)
  }

  const toggleWidgetCollapsed = (widgetId: TWidgetId) => {
    setCollapsedWidgetIds((prev) =>
      prev.includes(widgetId) ? prev.filter((id) => id !== widgetId) : [...prev, widgetId]
    )
  }

  const isWidgetCollapsed = (widgetId: TWidgetId) => {
    return collapsedWidgetIds.includes(widgetId)
  }

  const getWidgetHeight = (widgetId: TWidgetId) => {
    return widgetHeights[widgetId]
  }

  const setWidgetHeight = (widgetId: TWidgetId, height: number) => {
    setWidgetHeightsState((prev) => ({
      ...prev,
      [widgetId]: Math.round(height)
    }))
  }

  const clearWidgetHeight = (widgetId: TWidgetId) => {
    setWidgetHeightsState((prev) => {
      if (!(widgetId in prev)) {
        return prev
      }

      const next = { ...prev }
      delete next[widgetId]
      return next
    })
  }

  const getWidgetById = (widgetId: TWidgetId) => {
    return AVAILABLE_WIDGETS.find((w) => w.id === widgetId)
  }

  const reorderWidgets = (newOrder: TWidgetId[]) => {
    setEnabledWidgets(newOrder)
  }

  const pinNoteWidget = (eventId: string) => {
    const id = localStorageService.addPinnedNoteWidget(eventId)
    setPinnedNoteWidgets((prev) => [...prev, { id, eventId }])
    // Auto-enable the widget
    if (!enabledWidgets.includes(id)) {
      setEnabledWidgets((prev) => [...prev, id])
    }
    return id
  }

  const unpinNoteWidget = (widgetId: string) => {
    localStorageService.removePinnedNoteWidget(widgetId)
    setPinnedNoteWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    // Remove from enabled widgets
    setEnabledWidgets((prev) => prev.filter((id) => id !== widgetId))
  }

  const unpinNoteByEventId = (eventId: string) => {
    const widget = pinnedNoteWidgets.find((w) => w.eventId === eventId)
    if (widget) {
      unpinNoteWidget(widget.id)
    }
  }

  const isPinned = (eventId: string) => {
    return pinnedNoteWidgets.some((w) => w.eventId === eventId)
  }

  const pinLiveStreamWidget = (payload: Omit<TLiveStreamWidget, 'id'>) => {
    const existing = liveStreamWidgets.find((widget) => widget.naddr === payload.naddr)
    if (existing) {
      if (!enabledWidgets.includes(existing.id)) {
        setEnabledWidgets((prev) => [...prev, existing.id])
      }
      return existing.id
    }

    const id = localStorageService.addLiveStreamWidget(payload)
    setLiveStreamWidgets((prev) => [...prev, { id, ...payload }])
    if (!enabledWidgets.includes(id)) {
      setEnabledWidgets((prev) => [...prev, id])
    }
    return id
  }

  const unpinLiveStreamWidget = (widgetId: string) => {
    localStorageService.removeLiveStreamWidget(widgetId)
    setLiveStreamWidgets((prev) => prev.filter((widget) => widget.id !== widgetId))
    setEnabledWidgets((prev) => prev.filter((id) => id !== widgetId))
  }

  const unpinLiveStreamByNaddr = (naddr: string) => {
    const widget = liveStreamWidgets.find((item) => item.naddr === naddr)
    if (widget) {
      unpinLiveStreamWidget(widget.id)
    }
  }

  const isLiveStreamPinned = (naddr?: string) => {
    if (!naddr) return false
    return liveStreamWidgets.some((widget) => widget.naddr === naddr)
  }

  const openAIPrompt = (eventId: string) => {
    // Check if there's already an AI prompt widget open
    const existingWidget = aiPromptWidgets[0]

    if (existingWidget) {
      // Replace the existing widget with the new one
      const id = existingWidget.id
      setAIPromptWidgets([{ id, eventId, messages: [] }])
      // Update localStorage
      localStorageService.removeAIPromptWidget(id)
      localStorageService.addAIPromptWidget(eventId, id)
      return id
    } else {
      // Create new widget if none exists
      const id = localStorageService.addAIPromptWidget(eventId)
      setAIPromptWidgets([{ id, eventId, messages: [] }])
      // Auto-enable the widget
      if (!enabledWidgets.includes(id)) {
        setEnabledWidgets((prev) => [...prev, id])
      }
      return id
    }
  }

  const closeAIPrompt = (widgetId: string) => {
    localStorageService.removeAIPromptWidget(widgetId)
    setAIPromptWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    // Remove from enabled widgets
    setEnabledWidgets((prev) => prev.filter((id) => id !== widgetId))
  }

  const closeAIPromptByEventId = (eventId: string) => {
    const widget = aiPromptWidgets.find((w) => w.eventId === eventId)
    if (widget) {
      closeAIPrompt(widget.id)
    }
  }

  const isAIPromptOpen = (eventId: string) => {
    return aiPromptWidgets.some((w) => w.eventId === eventId)
  }

  const updateAIPromptMessages = (widgetId: string, messages: TAIMessage[]) => {
    setAIPromptWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, messages } : w))
    )
  }

  const getAIPromptWidget = (widgetId: string) => {
    return aiPromptWidgets.find((w) => w.id === widgetId)
  }

  return (
    <WidgetsContext.Provider
      value={{
        enabledWidgets,
        toggleWidget,
        isWidgetEnabled,
        toggleWidgetCollapsed,
        isWidgetCollapsed,
        getWidgetHeight,
        setWidgetHeight,
        clearWidgetHeight,
        getWidgetById,
        reorderWidgets,
        hideWidgetTitles,
        setHideWidgetTitles,
        trendingNotesHeight,
        setTrendingNotesHeight,
        bitcoinTickerAlignment,
        setBitcoinTickerAlignment,
        bitcoinTickerTextSize,
        setBitcoinTickerTextSize,
        bitcoinTickerShowBlockHeight,
        setBitcoinTickerShowBlockHeight,
        bitcoinTickerShowSatsMode,
        setBitcoinTickerShowSatsMode,
        stockTrackerSymbols,
        addStockTrackerSymbol,
        removeStockTrackerSymbol,
        newsWidgetRelays,
        addNewsWidgetRelay,
        removeNewsWidgetRelay,
        newsWidgetHashtags,
        addNewsWidgetHashtag,
        removeNewsWidgetHashtag,
        pinnedNoteWidgets,
        pinNoteWidget,
        unpinNoteWidget,
        unpinNoteByEventId,
        isPinned,
        liveStreamWidgets,
        pinLiveStreamWidget,
        unpinLiveStreamWidget,
        unpinLiveStreamByNaddr,
        isLiveStreamPinned,
        aiPromptWidgets,
        openAIPrompt,
        closeAIPrompt,
        closeAIPromptByEventId,
        isAIPromptOpen,
        updateAIPromptMessages,
        getAIPromptWidget
      }}
    >
      {children}
    </WidgetsContext.Provider>
  )
}

export function useWidgets() {
  const context = useContext(WidgetsContext)
  if (!context) {
    throw new Error('useWidgets must be used within a WidgetsProvider')
  }
  return context
}

function normalizeWidgetHashtag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase()
}
