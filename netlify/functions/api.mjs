const STOCK_QUOTE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'

const POLYMARKET_EVENTS_FETCH_LIMIT = 160
const POLYMARKET_RECENT_EVENTS_FETCH_LIMIT = 80
const POLYMARKET_MARKETS_MAX = 160
const POLYMARKET_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'
const NO_STORE_CACHE_CONTROL = 'no-store'
const UPSTREAM_TIMEOUT_MS = 6 * 1000
const POLYMARKET_CATEGORY_PRIORITY = [
  ['politics', 'Politics'],
  ['sports', 'Sports'],
  ['crypto', 'Crypto'],
  ['world', 'World'],
  ['business', 'Business'],
  ['finance', 'Finance'],
  ['tech', 'Tech'],
  ['pop-culture', 'Culture'],
  ['science', 'Science']
]
const POLYMARKET_IGNORED_CATEGORY_SLUGS = new Set([
  'featured',
  '2025-predictions',
  'up-or-down',
  'crypto-prices',
  'hide-from-new',
  'recurring'
])
const POLYMARKET_EXCLUDED_MARKET_TAG_SLUGS = new Set(['up-or-down', 'crypto-prices', 'recurring'])
const POLYMARKET_CATEGORY_ALIASES = new Map([
  [
    'politics',
    new Set([
      'politics',
      'elections',
      'world-elections',
      'global-elections',
      'us-presidential-election',
      'foreign-policy',
      'primaries',
      'president',
      'trump-presidency',
      'trump'
    ])
  ],
  [
    'sports',
    new Set([
      'sports',
      'games',
      'basketball',
      'nba',
      'nhl',
      'soccer',
      'epl',
      'nfl',
      'mlb',
      'march-madness',
      'ncaa',
      'ncaa-basketball',
      'hockey',
      'boxing',
      'mma',
      'golf',
      'tennis',
      'esports',
      'league-of-legends',
      'ucl',
      'champions-league',
      'fifa-world-cup',
      'cbb'
    ])
  ],
  [
    'crypto',
    new Set([
      'crypto',
      'bitcoin',
      'ethereum',
      'dogecoin',
      'solana',
      'xrp',
      'bnb',
      'altcoin',
      'crypto-prices',
      'hit-price'
    ])
  ],
  [
    'world',
    new Set([
      'world',
      'geopolitics',
      'middle-east',
      'israel',
      'iran',
      'china',
      'russia',
      'ukraine',
      'diplomacy-ceasefire'
    ])
  ],
  ['business', new Set(['business', 'commodities', 'oil', 'trade-war'])],
  ['finance', new Set(['finance', 'economy', 'economic-policy', 'fed', 'fed-rates', 'fomc'])],
  ['tech', new Set(['tech', 'ai', 'big-tech'])],
  ['pop-culture', new Set(['pop-culture', 'entertainment', 'music', 'awards', 'tweets-markets'])],
  ['science', new Set(['science', 'aliens', 'space'])]
])

const headers = {
  'Content-Type': 'application/json'
}

export async function handleApiRequest(request, env = {}) {
  let route = '/'

  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...headers, 'Cache-Control': NO_STORE_CACHE_CONTROL }
      })
    }

    route = extractRoute(request.url)
    if (request.method === 'GET' && route === '/v1/stocks/quote') {
      return await getStockQuote(request, env)
    }

    if (request.method === 'GET' && route === '/v1/polymarket/markets') {
      return await getPolymarketMarkets()
    }

    return json(404, { error: 'Not found' })
  } catch (error) {
    const status = getHttpErrorStatus(error)
    logApiError(request, route, status, error)
    return json(status, { error: getHttpErrorMessage(error) })
  }
}

export default async function netlifyApiHandler(request) {
  return handleApiRequest(request, {
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY || ''
  })
}

async function getStockQuote(request, env) {
  const apiKey =
    typeof env?.ALPHAVANTAGE_API_KEY === 'string' ? env.ALPHAVANTAGE_API_KEY.trim() : ''
  if (!apiKey) {
    return json(503, { error: 'Alpha Vantage API key is not configured' })
  }

  const url = new URL(request.url)
  const symbol = normalizeStockSymbol(url.searchParams.get('symbol') || '')
  if (!symbol) {
    return json(400, { error: 'A valid stock symbol is required' })
  }

  const quote = await getAlphaVantageStockQuote(symbol, apiKey)
  return json(200, quote, { 'Cache-Control': STOCK_QUOTE_CACHE_CONTROL })
}

async function getPolymarketMarkets() {
  const payload = await fetchPolymarketWidgetData()
  return json(200, payload, { 'Cache-Control': POLYMARKET_CACHE_CONTROL })
}

async function getAlphaVantageStockQuote(symbol, apiKey) {
  const url = new URL('https://www.alphavantage.co/query')
  url.searchParams.set('function', 'GLOBAL_QUOTE')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('apikey', apiKey)

  const response = await fetchUpstream(
    url.toString(),
    { headers: { Accept: 'application/json' } },
    {
      failureMessage: 'Stock quote provider request failed',
      failureCode: 'STOCK_PROVIDER_REQUEST_FAILED',
      timeoutMessage: 'Stock quote provider request timed out',
      timeoutCode: 'STOCK_PROVIDER_TIMEOUT'
    }
  )

  if (!response.ok) {
    throw createHttpError(502, 'Stock quote provider request failed', 'STOCK_PROVIDER_BAD_STATUS')
  }

  const payload = await parseUpstreamJson(
    response,
    'Stock quote provider returned an invalid response',
    'STOCK_PROVIDER_INVALID_JSON'
  )
  const rateLimitMessage =
    (typeof payload?.Note === 'string' && payload.Note.trim()) ||
    (typeof payload?.Information === 'string' && payload.Information.trim()) ||
    ''

  if (rateLimitMessage) {
    throw createHttpError(
      429,
      'Stock quote service rate limit reached',
      'STOCK_PROVIDER_RATE_LIMIT'
    )
  }

  if (typeof payload?.['Error Message'] === 'string' && payload['Error Message'].trim()) {
    throw createHttpError(404, `No stock quote found for ${symbol}`, 'STOCK_QUOTE_NOT_FOUND')
  }

  const quote = payload?.['Global Quote']
  if (!quote || typeof quote !== 'object' || !String(quote['01. symbol'] || '').trim()) {
    throw createHttpError(404, `No stock quote found for ${symbol}`, 'STOCK_QUOTE_NOT_FOUND')
  }

  return {
    symbol: String(quote['01. symbol'] || symbol)
      .trim()
      .toUpperCase(),
    price: parseAlphaVantageNumber(quote['05. price']),
    change: parseAlphaVantageNumber(quote['09. change']),
    changePercent: parseAlphaVantageNumber(quote['10. change percent']),
    open: parseAlphaVantageNumber(quote['02. open']),
    high: parseAlphaVantageNumber(quote['03. high']),
    low: parseAlphaVantageNumber(quote['04. low']),
    previousClose: parseAlphaVantageNumber(quote['08. previous close']),
    volume: parseAlphaVantageNumber(quote['06. volume']),
    latestTradingDay:
      typeof quote['07. latest trading day'] === 'string' && quote['07. latest trading day'].trim()
        ? quote['07. latest trading day'].trim()
        : null
  }
}

async function fetchPolymarketWidgetData() {
  const [topVolumeEvents, recentEvents] = await Promise.all([
    fetchPolymarketEvents({
      limit: POLYMARKET_EVENTS_FETCH_LIMIT,
      order: 'volume24hr'
    }),
    fetchPolymarketEvents({
      limit: POLYMARKET_RECENT_EVENTS_FETCH_LIMIT,
      order: 'createdAt'
    })
  ])

  return normalizePolymarketWidgetData([topVolumeEvents, recentEvents])
}

async function fetchPolymarketEvents({ limit, order }) {
  const url = new URL('https://gamma-api.polymarket.com/events')
  url.searchParams.set('active', 'true')
  url.searchParams.set('closed', 'false')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('order', order)
  url.searchParams.set('ascending', 'false')

  const response = await fetchUpstream(
    url.toString(),
    { headers: { Accept: 'application/json' } },
    {
      failureMessage: 'Polymarket request failed',
      failureCode: 'POLYMARKET_REQUEST_FAILED',
      timeoutMessage: 'Polymarket request timed out',
      timeoutCode: 'POLYMARKET_TIMEOUT'
    }
  )

  if (!response.ok) {
    throw createHttpError(502, 'Polymarket request failed', 'POLYMARKET_BAD_STATUS')
  }

  const payload = await parseUpstreamJson(
    response,
    'Invalid Polymarket payload',
    'POLYMARKET_INVALID_JSON'
  )
  if (!Array.isArray(payload)) {
    throw createHttpError(502, 'Invalid Polymarket payload', 'POLYMARKET_INVALID_PAYLOAD')
  }

  return payload
}

function normalizePolymarketWidgetData(eventBatches) {
  const seenEventIds = new Set()
  const events = []

  for (const batch of eventBatches) {
    if (!Array.isArray(batch)) continue

    for (const event of batch) {
      if (!event || typeof event !== 'object') continue

      const eventId = String(event.id || event.slug || '').trim()
      if (!eventId || seenEventIds.has(eventId)) continue

      seenEventIds.add(eventId)
      events.push(event)
    }
  }

  const categoryCountMap = new Map()
  const seenMarketIds = new Set()
  const markets = []

  for (const event of events) {
    if (!event || typeof event !== 'object') continue

    const rawEventTags = normalizePolymarketCategories(event.tags)
    const rawEventTagSlugs = rawEventTags.map((category) => category.slug)
    const eventCategorySlugs = resolvePolymarketCategorySlugs(rawEventTagSlugs)
    if (shouldExcludePolymarketEventFromWidget(event, rawEventTagSlugs)) {
      continue
    }

    eventCategorySlugs.forEach((slug) => {
      const existing = categoryCountMap.get(slug)
      const label = getPolymarketCategoryLabel(slug)
      if (existing) {
        existing.count += 1
        return
      }

      categoryCountMap.set(slug, { slug, label, count: 1 })
    })

    const eventSlug = pickString([event.slug])
    const eventMarkets = Array.isArray(event.markets) ? event.markets : []
    for (const market of eventMarkets) {
      if (!market || typeof market !== 'object') continue
      if (market.closed || !market.active) continue

      const slug = pickString([market.slug, event.slug])
      const question = pickString([market.question, market.title, event.title])
      if (!slug || !question) continue

      const marketId = String(market.id || slug).trim()
      if (!marketId || seenMarketIds.has(marketId)) continue
      seenMarketIds.add(marketId)

      const leadingOutcome = getLeadingPolymarketOutcome(market.outcomes, market.outcomePrices)
      const primaryCategory = pickPrimaryPolymarketCategory(eventCategorySlugs)

      markets.push({
        id: marketId,
        slug,
        url: `https://polymarket.com/event/${eventSlug || slug}`,
        question,
        eventTitle: pickString([event.title]) || null,
        image: pickString([market.image, market.icon, event.image, event.icon]) || null,
        createdAt: pickString([market.createdAt, event.createdAt, event.creationDate]) || null,
        endDate: pickString([market.endDate, event.endDate]) || null,
        volume24hr: pickFiniteNumber([market.volume24hr]),
        volume: pickFiniteNumber([market.volume, market.volumeNum]),
        primaryCategory: primaryCategory ? getPolymarketCategoryLabel(primaryCategory) : null,
        categorySlugs: eventCategorySlugs,
        leadingOutcomeLabel: leadingOutcome?.label || null,
        leadingOutcomeProbability: leadingOutcome?.probability ?? null,
        featured: !!event.featured,
        isNew: !!event.new
      })
    }
  }

  const sortedMarkets = sortPolymarketMarkets(markets)
  const diversifiedMarkets = diversifyPolymarketMarkets(sortedMarkets)

  return {
    fetchedAt: Date.now(),
    categories: buildPolymarketCategories(categoryCountMap),
    markets: diversifiedMarkets.slice(0, POLYMARKET_MARKETS_MAX)
  }
}

function normalizePolymarketCategories(tags) {
  if (!Array.isArray(tags)) return []

  const seen = new Set()
  const categories = []

  for (const tag of tags) {
    if (!tag || typeof tag !== 'object') continue

    const slug = normalizePolymarketSlug(tag.slug || tag.label || '')
    if (!slug || seen.has(slug) || shouldIgnorePolymarketTagSlug(slug)) {
      continue
    }

    const label =
      typeof tag.label === 'string' && tag.label.trim()
        ? tag.label.trim()
        : humanizePolymarketSlug(slug)

    seen.add(slug)
    categories.push({ slug, label })
  }

  return categories
}

function buildPolymarketCategories(categoryCountMap) {
  const categories = [{ slug: 'all', label: 'All' }]
  const seen = new Set(['all'])

  for (const [slug, label] of POLYMARKET_CATEGORY_PRIORITY) {
    const category = categoryCountMap.get(slug)
    if (!category || seen.has(slug)) continue

    categories.push({
      slug,
      label: category.label || label
    })
    seen.add(slug)
  }

  const fallbackCategories = Array.from(categoryCountMap.values())
    .filter((category) => !seen.has(category.slug) && category.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count
      }
      return a.label.localeCompare(b.label)
    })
    .slice(0, 6)

  fallbackCategories.forEach((category) => {
    categories.push({
      slug: category.slug,
      label: category.label
    })
  })

  return categories
}

function shouldIgnorePolymarketTagSlug(slug) {
  return (
    !slug ||
    POLYMARKET_IGNORED_CATEGORY_SLUGS.has(slug) ||
    /^\d+[mhdwy]$/i.test(slug) ||
    /^earn-\d+/i.test(slug) ||
    /^rewards?-/i.test(slug)
  )
}

function resolvePolymarketCategorySlugs(tagSlugs) {
  const resolvedSlugs = []
  const seen = new Set()

  for (const [categorySlug, aliases] of POLYMARKET_CATEGORY_ALIASES) {
    if (!tagSlugs.some((tagSlug) => aliases.has(tagSlug))) continue
    resolvedSlugs.push(categorySlug)
    seen.add(categorySlug)
  }

  for (const [categorySlug] of POLYMARKET_CATEGORY_PRIORITY) {
    if (seen.has(categorySlug) || !tagSlugs.includes(categorySlug)) continue
    resolvedSlugs.push(categorySlug)
    seen.add(categorySlug)
  }

  return resolvedSlugs
}

function getPolymarketCategoryLabel(slug) {
  const preferred = POLYMARKET_CATEGORY_PRIORITY.find(([categorySlug]) => categorySlug === slug)
  if (preferred) {
    return preferred[1]
  }

  return humanizePolymarketSlug(slug)
}

function shouldExcludePolymarketEventFromWidget(event, tagSlugs) {
  if (!event || typeof event !== 'object') {
    return true
  }

  if (event.closed || event.archived || !event.active) {
    return true
  }

  if (event.featured) {
    return false
  }

  return tagSlugs.some((slug) => POLYMARKET_EXCLUDED_MARKET_TAG_SLUGS.has(slug))
}

function sortPolymarketMarkets(markets) {
  return [...markets].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) {
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured))
    }

    const volume24hrDiff = (b.volume24hr ?? -1) - (a.volume24hr ?? -1)
    if (volume24hrDiff !== 0) return volume24hrDiff

    const volumeDiff = (b.volume ?? -1) - (a.volume ?? -1)
    if (volumeDiff !== 0) return volumeDiff

    if (Boolean(a.isNew) !== Boolean(b.isNew)) {
      return Number(Boolean(b.isNew)) - Number(Boolean(a.isNew))
    }

    return toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
  })
}

function diversifyPolymarketMarkets(markets) {
  if (markets.length <= 1) {
    return markets
  }

  const used = new Set()
  const result = []
  const bucketMap = new Map(
    POLYMARKET_CATEGORY_PRIORITY.map(([slug]) => [
      slug,
      markets.filter((market) => market.categorySlugs.includes(slug))
    ])
  )
  const bucketIndexMap = new Map(POLYMARKET_CATEGORY_PRIORITY.map(([slug]) => [slug, 0]))

  let addedInPass = true
  while (addedInPass) {
    addedInPass = false

    for (const [slug] of POLYMARKET_CATEGORY_PRIORITY) {
      const bucket = bucketMap.get(slug) ?? []
      let nextIndex = bucketIndexMap.get(slug) ?? 0

      while (nextIndex < bucket.length && used.has(bucket[nextIndex].id)) {
        nextIndex += 1
      }

      bucketIndexMap.set(slug, nextIndex + 1)
      if (nextIndex >= bucket.length) {
        continue
      }

      const market = bucket[nextIndex]
      used.add(market.id)
      result.push(market)
      addedInPass = true
    }
  }

  markets.forEach((market) => {
    if (!used.has(market.id)) {
      result.push(market)
    }
  })

  return result
}

function pickPrimaryPolymarketCategory(categorySlugs) {
  if (!categorySlugs.length) return null

  for (const [slug] of POLYMARKET_CATEGORY_PRIORITY) {
    if (categorySlugs.includes(slug)) return slug
  }

  return categorySlugs[0]
}

function getLeadingPolymarketOutcome(outcomesValue, outcomePricesValue) {
  const outcomes = parsePolymarketStringArray(outcomesValue)
  const prices = parsePolymarketNumberArray(outcomePricesValue)

  if (!outcomes.length || !prices.length) {
    return null
  }

  let bestIndex = -1
  let bestPrice = -1

  for (let index = 0; index < Math.min(outcomes.length, prices.length); index += 1) {
    const price = prices[index]
    if (!Number.isFinite(price) || price < bestPrice) continue

    bestPrice = price
    bestIndex = index
  }

  if (bestIndex === -1) {
    return null
  }

  return {
    label: outcomes[bestIndex],
    probability: bestPrice
  }
}

function parsePolymarketStringArray(value) {
  const parsed = parsePolymarketArrayValue(value)
  return parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function parsePolymarketNumberArray(value) {
  return parsePolymarketArrayValue(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function parsePolymarketArrayValue(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeStockSymbol(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^\$/, '')
    .toUpperCase()

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) {
    return ''
  }

  return normalized
}

function parseAlphaVantageNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replace(/,/g, '').replace(/%/g, '').trim()
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function pickFiniteNumber(values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function normalizePolymarketSlug(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function humanizePolymarketSlug(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pickString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function toTimestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function extractRoute(rawUrl) {
  const url = new URL(rawUrl)
  const marker = '/v1/'
  const index = url.pathname.indexOf(marker)
  if (index >= 0) {
    return url.pathname.slice(index)
  }
  return url.pathname
}

async function fetchUpstream(url, init, errorDetails) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError(504, errorDetails.timeoutMessage, errorDetails.timeoutCode)
    }
    throw createHttpError(502, errorDetails.failureMessage, errorDetails.failureCode)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function parseUpstreamJson(response, message, errorCode) {
  try {
    return await response.json()
  } catch {
    throw createHttpError(502, message, errorCode)
  }
}

function createHttpError(statusCode, publicMessage, errorCode) {
  const err = new Error(errorCode)
  err.statusCode = statusCode
  err.publicMessage = publicMessage
  err.errorCode = errorCode
  return err
}

function getHttpErrorStatus(error) {
  const status = Number(error?.statusCode)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

function getHttpErrorMessage(error) {
  return typeof error?.publicMessage === 'string' && error.publicMessage.trim()
    ? error.publicMessage
    : 'Internal server error'
}

function logApiError(request, route, status, error) {
  const payload = {
    event: 'api_request_error',
    method: request.method,
    route,
    status,
    code:
      typeof error?.errorCode === 'string' && error.errorCode.trim()
        ? error.errorCode
        : 'UNEXPECTED_ERROR',
    rayId: request.headers.get('cf-ray') || undefined
  }

  console.error(JSON.stringify(payload))
}

function json(status, payload, extraHeaders = {}) {
  const responseHeaders = { ...headers, ...extraHeaders }
  if (status >= 400 && !responseHeaders['Cache-Control']) {
    responseHeaders['Cache-Control'] = NO_STORE_CACHE_CONTROL
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders
  })
}
