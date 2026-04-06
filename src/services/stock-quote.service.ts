import { TStockQuote } from '@/types'

type TStockQuoteCacheEntry = {
  fetchedAt: number
  quote: TStockQuote
}

const STOCK_QUOTE_FRESH_TTL_MS = 15 * 60 * 1000
const STOCK_QUOTE_STALE_TTL_MS = 24 * 60 * 60 * 1000
const STOCK_QUOTE_STORAGE_KEY = 'x21:stock-quote-cache'
const STOCK_QUOTE_STORAGE_MAX_ENTRIES = 100
const STOCK_QUOTE_API_PATH = '/v1/stocks/quote'
const STOCK_QUOTE_TIMEOUT_MS = 8000
const VALID_STOCK_SYMBOL_REGEX = /^[A-Z][A-Z0-9.-]{0,9}$/

class StockQuoteService {
  static instance: StockQuoteService

  private cache = new Map<string, TStockQuoteCacheEntry>()
  private inflight = new Map<string, Promise<TStockQuote>>()

  constructor() {
    if (!StockQuoteService.instance) {
      StockQuoteService.instance = this
    }

    return StockQuoteService.instance
  }

  async getQuote(rawSymbol: string): Promise<TStockQuote> {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!isValidStockSymbol(symbol)) {
      throw new Error('Invalid stock symbol')
    }

    const freshEntry = this.getCachedEntry(symbol)
    if (freshEntry) {
      return freshEntry.quote
    }

    const staleEntry = this.getCachedEntry(symbol, { allowStale: true })
    const inflight = this.inflight.get(symbol)
    if (inflight) {
      return staleEntry?.quote ?? inflight
    }

    if (staleEntry) {
      void this.refreshQuote(symbol).catch(() => undefined)
      return staleEntry.quote
    }

    return this.refreshQuote(symbol)
  }

  peekQuote(rawSymbol: string, { allowStale = true }: { allowStale?: boolean } = {}) {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!isValidStockSymbol(symbol)) {
      return null
    }

    return this.getCachedEntry(symbol, { allowStale })?.quote ?? null
  }

  prefetchQuote(rawSymbol: string) {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!isValidStockSymbol(symbol)) {
      return Promise.resolve(null)
    }

    const freshEntry = this.getCachedEntry(symbol)
    if (freshEntry) {
      return Promise.resolve(freshEntry.quote)
    }

    const inflight = this.inflight.get(symbol)
    if (inflight) {
      return inflight
    }

    return this.refreshQuote(symbol).catch(() => this.peekQuote(symbol))
  }

  forceRefreshQuote(rawSymbol: string): Promise<TStockQuote> {
    const symbol = normalizeStockSymbol(rawSymbol)
    if (!isValidStockSymbol(symbol)) {
      return Promise.reject(new Error('Invalid stock symbol'))
    }

    return this.refreshQuote(symbol)
  }

  private refreshQuote(symbol: string) {
    const inflight = this.inflight.get(symbol)
    if (inflight) {
      return inflight
    }

    const request = this.fetchQuote(symbol).finally(() => {
      this.inflight.delete(symbol)
    })

    this.inflight.set(symbol, request)
    return request
  }

  private async fetchQuote(symbol: string): Promise<TStockQuote> {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), STOCK_QUOTE_TIMEOUT_MS)

    try {
      const response = await fetch(`${STOCK_QUOTE_API_PATH}?symbol=${encodeURIComponent(symbol)}`, {
        signal: controller.signal
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : 'Failed to load stock quote'
        )
      }

      const quote = data as TStockQuote
      this.setCachedQuote(symbol, quote)
      return quote
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Stock quote request timed out')
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  private getCachedEntry(symbol: string, { allowStale = false }: { allowStale?: boolean } = {}) {
    const memoryEntry = this.cache.get(symbol)
    if (memoryEntry && !isExpired(memoryEntry.fetchedAt, allowStale)) {
      return memoryEntry
    }
    if (memoryEntry && isExpired(memoryEntry.fetchedAt, true)) {
      this.cache.delete(symbol)
    }

    const storage = this.readStorage()
    const storageEntry = storage[symbol]
    if (storageEntry && !isExpired(storageEntry.fetchedAt, allowStale)) {
      this.cache.set(symbol, storageEntry)
      return storageEntry
    }
    if (storageEntry && isExpired(storageEntry.fetchedAt, true)) {
      delete storage[symbol]
      this.writeStorage(storage)
    }

    return null
  }

  private setCachedQuote(symbol: string, quote: TStockQuote) {
    const entry = {
      fetchedAt: Date.now(),
      quote
    }

    this.cache.set(symbol, entry)

    const storage = this.readStorage()
    storage[symbol] = entry
    this.writeStorage(storage)
  }

  private readStorage(): Record<string, TStockQuoteCacheEntry> {
    if (typeof window === 'undefined') {
      return {}
    }

    try {
      const raw = window.localStorage.getItem(STOCK_QUOTE_STORAGE_KEY)
      if (!raw) {
        return {}
      }
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private writeStorage(storage: Record<string, TStockQuoteCacheEntry>) {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const entries = Object.entries(storage)
        .filter(([, entry]) => entry && !isExpired(entry.fetchedAt, true))
        .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
        .slice(0, STOCK_QUOTE_STORAGE_MAX_ENTRIES)

      window.localStorage.setItem(STOCK_QUOTE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
    } catch {
      // localStorage can fail in private browsing or when the quota is exhausted.
    }
  }
}

export function normalizeStockSymbol(rawSymbol: string) {
  return rawSymbol.replace(/^\$/, '').trim().toUpperCase()
}

export function isValidStockSymbol(symbol: string) {
  return VALID_STOCK_SYMBOL_REGEX.test(symbol)
}

function isExpired(fetchedAt: number, allowStale = false) {
  return Date.now() - fetchedAt > (allowStale ? STOCK_QUOTE_STALE_TTL_MS : STOCK_QUOTE_FRESH_TTL_MS)
}

const stockQuoteService = new StockQuoteService()
export default stockQuoteService
