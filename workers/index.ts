import { handleApiRequest } from '../netlify/functions/api.mjs'

const CLIENT_API_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'
const STOCK_EDGE_CACHE_TTL_SECONDS = 15 * 60
const POLYMARKET_EDGE_CACHE_TTL_SECONDS = 2 * 60

type ApiCachePolicy = {
  edgeTtlSeconds: number
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = new URL(request.url).pathname

    if (isBackendRoute(pathname)) {
      return handleWorkerApiRequest(request, env, ctx)
    }

    return env.ASSETS.fetch(request)
  }
} satisfies ExportedHandler<Env>

async function handleWorkerApiRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const pathname = new URL(request.url).pathname
  const cachePolicy = request.method === 'GET' ? getApiCachePolicy(pathname) : null
  const cache = cachePolicy ? caches.default : null
  const cacheKey = cache ? createApiCacheKey(request) : null

  if (cache && cacheKey) {
    try {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        return createClientApiResponse(cachedResponse)
      }
    } catch {
      logCacheError('match', pathname)
    }
  }

  const response = await handleApiRequest(request, env)
  if (!cache || !cacheKey || !cachePolicy || response.status !== 200) {
    return response
  }

  const cacheWrite = cache
    .put(cacheKey, createEdgeCacheResponse(response.clone(), cachePolicy.edgeTtlSeconds))
    .catch(() => logCacheError('put', pathname))
  ctx.waitUntil(cacheWrite)

  return response
}

function isBackendRoute(pathname: string) {
  return (
    pathname === '/v1' ||
    pathname.startsWith('/v1/') ||
    pathname === '/.well-known' ||
    pathname.startsWith('/.well-known/')
  )
}

function getApiCachePolicy(pathname: string): ApiCachePolicy | null {
  if (pathname === '/v1/stocks/quote') {
    return { edgeTtlSeconds: STOCK_EDGE_CACHE_TTL_SECONDS }
  }

  if (pathname === '/v1/polymarket/markets') {
    return { edgeTtlSeconds: POLYMARKET_EDGE_CACHE_TTL_SECONDS }
  }

  return null
}

function createApiCacheKey(request: Request) {
  const url = new URL(request.url)
  url.hash = ''

  if (url.pathname === '/v1/stocks/quote') {
    const symbol = normalizeStockSymbolForCache(url.searchParams.get('symbol') || '')
    url.search = ''
    if (symbol) {
      url.searchParams.set('symbol', symbol)
    }
  } else if (url.pathname === '/v1/polymarket/markets') {
    url.search = ''
  }

  return new Request(url.toString(), { method: 'GET' })
}

function normalizeStockSymbolForCache(value: string) {
  const normalized = value.trim().replace(/^\$/, '').toUpperCase()
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized) ? normalized : ''
}

function createEdgeCacheResponse(response: Response, edgeTtlSeconds: number) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', `public, max-age=${edgeTtlSeconds}`)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function createClientApiResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', CLIENT_API_CACHE_CONTROL)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function logCacheError(operation: 'match' | 'put', route: string) {
  console.error(
    JSON.stringify({
      event: 'worker_cache_error',
      operation,
      route
    })
  )
}
