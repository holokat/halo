const STOCK_QUOTE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'
const NO_STORE_CACHE_CONTROL = 'no-store'
const UPSTREAM_TIMEOUT_MS = 6 * 1000

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
