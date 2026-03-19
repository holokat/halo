export type TPolymarketCategory = {
  slug: string
  label: string
}

export type TPolymarketMarket = {
  id: string
  slug: string
  url: string
  question: string
  eventTitle: string | null
  image: string | null
  createdAt: string | null
  endDate: string | null
  volume24hr: number | null
  volume: number | null
  primaryCategory: string | null
  categorySlugs: string[]
  leadingOutcomeLabel: string | null
  leadingOutcomeProbability: number | null
}

export type TPolymarketWidgetPayload = {
  fetchedAt: number
  categories: TPolymarketCategory[]
  markets: TPolymarketMarket[]
}

const POLYMARKET_API_PATH = '/v1/polymarket/markets'
const POLYMARKET_TIMEOUT_MS = 8000
const POLYMARKET_FRESH_TTL_MS = 2 * 60 * 1000

class PolymarketService {
  static instance: PolymarketService

  private cache: TPolymarketWidgetPayload | null = null
  private fetchedAt = 0
  private inflight: Promise<TPolymarketWidgetPayload> | null = null

  constructor() {
    if (!PolymarketService.instance) {
      PolymarketService.instance = this
    }

    return PolymarketService.instance
  }

  async getWidgetData({ force = false }: { force?: boolean } = {}) {
    if (!force && this.cache && Date.now() - this.fetchedAt < POLYMARKET_FRESH_TTL_MS) {
      return this.cache
    }

    if (this.inflight) {
      return this.inflight
    }

    const request = this.fetchWidgetData().finally(() => {
      this.inflight = null
    })

    this.inflight = request
    return request
  }

  peekWidgetData() {
    return this.cache
  }

  private async fetchWidgetData() {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), POLYMARKET_TIMEOUT_MS)

    try {
      const response = await fetch(POLYMARKET_API_PATH, {
        signal: controller.signal
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : 'Failed to load Polymarket markets'
        )
      }

      const payload = normalizePolymarketPayload(data)
      this.cache = payload
      this.fetchedAt = Date.now()
      return payload
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Polymarket request timed out')
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }
}

function normalizePolymarketPayload(value: unknown): TPolymarketWidgetPayload {
  const payload = value && typeof value === 'object' ? (value as Partial<TPolymarketWidgetPayload>) : {}

  return {
    fetchedAt: typeof payload.fetchedAt === 'number' ? payload.fetchedAt : Date.now(),
    categories: Array.isArray(payload.categories)
      ? payload.categories
          .map((category) => normalizeCategory(category))
          .filter((category): category is TPolymarketCategory => !!category)
      : [{ slug: 'all', label: 'All' }],
    markets: Array.isArray(payload.markets)
      ? payload.markets
          .map((market) => normalizeMarket(market))
          .filter((market): market is TPolymarketMarket => !!market)
      : []
  }
}

function normalizeCategory(value: unknown) {
  if (!value || typeof value !== 'object') return null

  const slug = typeof (value as TPolymarketCategory).slug === 'string' ? (value as TPolymarketCategory).slug.trim() : ''
  const label = typeof (value as TPolymarketCategory).label === 'string' ? (value as TPolymarketCategory).label.trim() : ''
  if (!slug || !label) return null

  return { slug, label }
}

function normalizeMarket(value: unknown) {
  if (!value || typeof value !== 'object') return null

  const market = value as Partial<TPolymarketMarket>
  const id = typeof market.id === 'string' ? market.id.trim() : ''
  const slug = typeof market.slug === 'string' ? market.slug.trim() : ''
  const url = typeof market.url === 'string' ? market.url.trim() : ''
  const question = typeof market.question === 'string' ? market.question.trim() : ''
  if (!id || !slug || !url || !question) return null

  return {
    id,
    slug,
    url,
    question,
    eventTitle: typeof market.eventTitle === 'string' && market.eventTitle.trim() ? market.eventTitle.trim() : null,
    image: typeof market.image === 'string' && market.image.trim() ? market.image.trim() : null,
    createdAt: typeof market.createdAt === 'string' && market.createdAt.trim() ? market.createdAt.trim() : null,
    endDate: typeof market.endDate === 'string' && market.endDate.trim() ? market.endDate.trim() : null,
    volume24hr: Number.isFinite(market.volume24hr) ? market.volume24hr ?? null : null,
    volume: Number.isFinite(market.volume) ? market.volume ?? null : null,
    primaryCategory:
      typeof market.primaryCategory === 'string' && market.primaryCategory.trim()
        ? market.primaryCategory.trim()
        : null,
    categorySlugs: Array.isArray(market.categorySlugs)
      ? market.categorySlugs.filter((slug): slug is string => typeof slug === 'string' && !!slug.trim())
      : [],
    leadingOutcomeLabel:
      typeof market.leadingOutcomeLabel === 'string' && market.leadingOutcomeLabel.trim()
        ? market.leadingOutcomeLabel.trim()
        : null,
    leadingOutcomeProbability:
      typeof market.leadingOutcomeProbability === 'number' &&
      Number.isFinite(market.leadingOutcomeProbability)
        ? market.leadingOutcomeProbability
        : null
  }
}

const polymarketService = new PolymarketService()
export default polymarketService
