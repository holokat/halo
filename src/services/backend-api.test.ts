import assert from 'node:assert/strict'
import test from 'node:test'
import { handleApiRequest } from '../../netlify/functions/api.mjs'

type RuntimeEnvironment = {
  ALPHAVANTAGE_API_KEY?: string
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

type RuntimeContext = {
  waitUntil(promise: Promise<unknown>): void
}

type WorkerModule = {
  default: {
    fetch(
      request: Request,
      env: RuntimeEnvironment,
      ctx: RuntimeContext
    ): Response | Promise<Response>
  }
}

class MemoryDefaultCache {
  readonly entries = new Map<string, Response>()
  readonly matchedKeys: string[] = []
  readonly putKeys: string[] = []

  async match(request: Request) {
    this.matchedKeys.push(request.url)
    return this.entries.get(request.url)?.clone()
  }

  async put(request: Request, response: Response) {
    this.putKeys.push(request.url)
    this.entries.set(request.url, response.clone())
  }
}

async function loadWorker() {
  const moduleUrl = new URL('../../workers/index.ts', import.meta.url).href
  return (await import(moduleUrl)) as WorkerModule
}

async function withFetchStub<T>(stub: typeof fetch, callback: () => Promise<T>) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = stub

  try {
    return await callback()
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function withConsoleErrorCapture<T>(callback: (lines: string[]) => Promise<T>) {
  const originalConsoleError = console.error
  const lines: string[] = []
  console.error = (...values: unknown[]) => lines.push(values.map(String).join(' '))

  try {
    return await callback(lines)
  } finally {
    console.error = originalConsoleError
  }
}

async function withDefaultCache<T>(cache: MemoryDefaultCache, callback: () => Promise<T>) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: cache }
  })

  try {
    return await callback()
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'caches', originalDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'caches')
    }
  }
}

function stockProviderPayload(symbol = 'AAPL') {
  return {
    'Global Quote': {
      '01. symbol': symbol,
      '02. open': '1,200.25',
      '03. high': '1,250.00',
      '04. low': '',
      '05. price': '1,234.50',
      '06. volume': '1,000',
      '07. latest trading day': ' 2026-08-31 ',
      '08. previous close': '1,204.375',
      '09. change': 'not-a-number',
      '10. change percent': '2.50%'
    }
  }
}

test('shared API keeps same-origin responses CORS-free and errors non-cacheable', async () => {
  const optionsResponse = await handleApiRequest(
    new Request('https://haloapp.fyi/v1/stocks/quote', { method: 'OPTIONS' }),
    {}
  )
  assert.equal(optionsResponse.status, 204)
  assert.equal(optionsResponse.headers.get('cache-control'), 'no-store')
  assert.equal(optionsResponse.headers.get('access-control-allow-origin'), null)

  const missingSecretResponse = await handleApiRequest(
    new Request('https://haloapp.fyi/v1/stocks/quote?symbol=AAPL'),
    {}
  )
  assert.equal(missingSecretResponse.status, 503)
  assert.equal(missingSecretResponse.headers.get('cache-control'), 'no-store')
  assert.equal(missingSecretResponse.headers.get('access-control-allow-origin'), null)
  assert.deepEqual(await missingSecretResponse.json(), {
    error: 'Alpha Vantage API key is not configured'
  })

  const unknownResponse = await handleApiRequest(new Request('https://haloapp.fyi/v1/unknown'), {})
  assert.equal(unknownResponse.status, 404)
  assert.equal(unknownResponse.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await unknownResponse.json(), { error: 'Not found' })

  const wellKnownResponse = await handleApiRequest(
    new Request('https://haloapp.fyi/.well-known/nostr.json'),
    {}
  )
  assert.equal(wellKnownResponse.status, 404)
  assert.equal(wellKnownResponse.headers.get('content-type'), 'application/json')
  assert.deepEqual(await wellKnownResponse.json(), { error: 'Not found' })
})

test('stock route reads the key per request, normalizes the quote, and keeps no module cache', async () => {
  const upstreamRequests: Request[] = []
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    upstreamRequests.push(request)
    const symbol = new URL(request.url).searchParams.get('symbol') || 'UNKNOWN'
    return Response.json(stockProviderPayload(symbol))
  }

  await withFetchStub(fetchStub, async () => {
    const firstUrl = new URL('https://haloapp.fyi/.netlify/functions/api/v1/stocks/quote')
    firstUrl.searchParams.set('symbol', ' $aapl ')

    const firstResponse = await handleApiRequest(new Request(firstUrl), {
      ALPHAVANTAGE_API_KEY: 'first-key'
    })
    const secondResponse = await handleApiRequest(
      new Request('https://haloapp.fyi/v1/stocks/quote?symbol=AAPL'),
      { ALPHAVANTAGE_API_KEY: 'second-key' }
    )

    assert.equal(firstResponse.status, 200)
    assert.equal(secondResponse.status, 200)
    assert.equal(
      firstResponse.headers.get('cache-control'),
      'public, max-age=60, stale-while-revalidate=300'
    )
    assert.equal(firstResponse.headers.get('access-control-allow-origin'), null)
    assert.deepEqual(await firstResponse.json(), {
      symbol: 'AAPL',
      price: 1234.5,
      change: null,
      changePercent: 2.5,
      open: 1200.25,
      high: 1250,
      low: null,
      previousClose: 1204.375,
      volume: 1000,
      latestTradingDay: '2026-08-31'
    })

    assert.equal(upstreamRequests.length, 2)
    assert.equal(upstreamRequests[0].headers.get('accept'), 'application/json')
    assert.equal(new URL(upstreamRequests[0].url).searchParams.get('function'), 'GLOBAL_QUOTE')
    assert.equal(new URL(upstreamRequests[0].url).searchParams.get('symbol'), 'AAPL')
    assert.equal(new URL(upstreamRequests[0].url).searchParams.get('apikey'), 'first-key')
    assert.equal(new URL(upstreamRequests[1].url).searchParams.get('apikey'), 'second-key')
    assert.ok(upstreamRequests.every((request) => request.signal instanceof AbortSignal))
  })
})

test('provider error details and secrets do not leak into responses or structured logs', async () => {
  const providerMessage = 'private provider billing detail'
  const apiKey = 'secret-alpha-key'
  const fetchStub: typeof fetch = async () => Response.json({ Note: providerMessage })

  await withFetchStub(fetchStub, async () => {
    await withConsoleErrorCapture(async (lines) => {
      const response = await handleApiRequest(
        new Request('https://haloapp.fyi/v1/stocks/quote?symbol=AAPL'),
        { ALPHAVANTAGE_API_KEY: apiKey }
      )
      const responseText = await response.text()

      assert.equal(response.status, 429)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(JSON.parse(responseText), {
        error: 'Stock quote service rate limit reached'
      })
      assert.equal(lines.length, 1)
      assert.equal(lines[0].includes(providerMessage), false)
      assert.equal(lines[0].includes(apiKey), false)
      assert.deepEqual(JSON.parse(lines[0]), {
        event: 'api_request_error',
        method: 'GET',
        route: '/v1/stocks/quote',
        status: 429,
        code: 'STOCK_PROVIDER_RATE_LIMIT'
      })
    })
  })
})

test('Worker routes backend paths, serves assets, and caches only successful API GETs', async () => {
  const cache = new MemoryDefaultCache()
  const providerRequests: Request[] = []
  const assetRequests: string[] = []
  const pending: Promise<unknown>[] = []
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    providerRequests.push(request)
    return Response.json(stockProviderPayload('AAPL'))
  }
  const env: RuntimeEnvironment = {
    ALPHAVANTAGE_API_KEY: 'worker-key',
    ASSETS: {
      async fetch(request) {
        assetRequests.push(request.url)
        return new Response('asset response')
      }
    }
  }
  const ctx: RuntimeContext = {
    waitUntil(promise) {
      pending.push(promise)
    }
  }

  await withFetchStub(fetchStub, async () => {
    await withDefaultCache(cache, async () => {
      const { default: worker } = await loadWorker()
      const firstUrl = new URL('https://haloapp.fyi/v1/stocks/quote')
      firstUrl.searchParams.set('symbol', '$aapl')
      firstUrl.searchParams.set('tracking', 'ignored')
      const firstResponse = await worker.fetch(new Request(firstUrl), env, ctx)
      await Promise.all(pending.splice(0))

      assert.equal(firstResponse.status, 200)
      assert.equal(providerRequests.length, 1)
      assert.equal(cache.putKeys.length, 1)
      assert.equal(cache.putKeys[0], 'https://haloapp.fyi/v1/stocks/quote?symbol=AAPL')
      assert.equal(
        cache.entries.get(cache.putKeys[0])?.headers.get('cache-control'),
        'public, max-age=900'
      )

      const cachedResponse = await worker.fetch(
        new Request('https://haloapp.fyi/v1/stocks/quote?unused=1&symbol=AAPL'),
        env,
        ctx
      )
      assert.equal(cachedResponse.status, 200)
      assert.equal(providerRequests.length, 1)
      assert.equal(
        cachedResponse.headers.get('cache-control'),
        'public, max-age=60, stale-while-revalidate=300'
      )

      const unknownApiResponse = await worker.fetch(
        new Request('https://haloapp.fyi/v1/unknown'),
        env,
        ctx
      )
      assert.equal(unknownApiResponse.status, 404)
      assert.deepEqual(await unknownApiResponse.json(), { error: 'Not found' })

      const wellKnownResponse = await worker.fetch(
        new Request('https://haloapp.fyi/.well-known/nostr.json'),
        env,
        ctx
      )
      assert.equal(wellKnownResponse.status, 404)
      assert.equal(wellKnownResponse.headers.get('cache-control'), 'no-store')

      const assetResponse = await worker.fetch(
        new Request('https://haloapp.fyi/settings'),
        env,
        ctx
      )
      assert.equal(await assetResponse.text(), 'asset response')
      assert.equal(assetResponse.headers.get('strict-transport-security'), 'max-age=31536000')
      assert.equal(assetResponse.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(
        assetResponse.headers.get('referrer-policy'),
        'strict-origin-when-cross-origin'
      )
      assert.deepEqual(assetRequests, ['https://haloapp.fyi/settings'])
    })
  })
})

test('Worker keeps the production site on HTTPS and redirects www to the apex domain', async () => {
  const { default: worker } = await loadWorker()
  const env: RuntimeEnvironment = {
    ASSETS: {
      async fetch() {
        throw new Error('assets should not be called for canonical redirects')
      }
    }
  }
  const ctx: RuntimeContext = {
    waitUntil() {
      throw new Error('waitUntil should not be called for canonical redirects')
    }
  }

  const insecureResponse = await worker.fetch(
    new Request('http://haloapp.fyi/settings?tab=reading'),
    env,
    ctx
  )
  assert.equal(insecureResponse.status, 308)
  assert.equal(
    insecureResponse.headers.get('location'),
    'https://haloapp.fyi/settings?tab=reading'
  )

  const wwwResponse = await worker.fetch(
    new Request('https://www.haloapp.fyi/search?q=nostr'),
    env,
    ctx
  )
  assert.equal(wwwResponse.status, 308)
  assert.equal(wwwResponse.headers.get('location'), 'https://haloapp.fyi/search?q=nostr')
  assert.equal(wwwResponse.headers.get('strict-transport-security'), 'max-age=31536000')
})

test('Worker does not write API failures to cache', async () => {
  const cache = new MemoryDefaultCache()
  const pending: Promise<unknown>[] = []
  const env: RuntimeEnvironment = {
    ASSETS: {
      async fetch() {
        throw new Error('assets should not be called for API routes')
      }
    }
  }
  const ctx: RuntimeContext = {
    waitUntil(promise) {
      pending.push(promise)
    }
  }

  await withDefaultCache(cache, async () => {
    const { default: worker } = await loadWorker()
    const response = await worker.fetch(
      new Request('https://haloapp.fyi/v1/stocks/quote?symbol=AAPL'),
      env,
      ctx
    )

    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(cache.putKeys.length, 0)
    assert.equal(pending.length, 0)
  })
})
