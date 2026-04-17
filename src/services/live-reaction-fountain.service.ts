import { BoundedMap } from '@/lib/bounded-map'
import {
  getLiveReactionFountainPayloadFromEvent,
  TLiveReactionFountainPayload
} from '@/lib/live-reaction-fountain'
import { SmartPool } from '@/lib/smart-pool'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import { Event as NostrEvent, kinds } from 'nostr-tools'
import { AbstractRelay, Subscription } from 'nostr-tools/abstract-relay'

const EVENT_DEDUPE_CACHE_SIZE = 1024
const FRESH_START_LOOKBACK_MS = 5_000
const STALE_RELAY_TIMEOUT_MS = 70_000
const WATCHDOG_INTERVAL_MS = 15_000
const RECONNECT_BASE_DELAY_MS = 1_500
const RECONNECT_MAX_DELAY_MS = 30_000

type TRelayPhase = 'stopped' | 'connecting' | 'connected' | 'backoff'

export type TLiveReactionRelayStatus = {
  url: string
  phase: TRelayPhase
  attempt: number
  lastFrameAt: number | null
  lastEventAt: number | null
  lastCloseReason: string | null
  lastError: string | null
  nextReconnectAt: number | null
}

type TPayloadListener = (payload: TLiveReactionFountainPayload) => void
type TStatusListener = (statuses: TLiveReactionRelayStatus[]) => void

type TRuntimeState = {
  enabled: boolean
  appActive: boolean
  pubkey: string | null
  relayUrls: string[]
}

class RelayConnection {
  readonly status: TLiveReactionRelayStatus

  private relay: AbstractRelay | null = null
  private subscription: Subscription | null = null
  private reconnectTimer: number | null = null
  private socket: WebSocket | null = null
  private connectGeneration = 0
  private stopped = true
  private socketMessageListener = () => {
    this.noteFrame()
  }

  constructor(
    private readonly url: string,
    private readonly pool: SmartPool,
    private readonly onPayload: (payload: TLiveReactionFountainPayload) => void,
    private readonly onStatusChange: () => void,
    private readonly getPubkey: () => string | null,
    private readonly getSinceUnix: () => number,
    private readonly debug: (message: string, details?: unknown) => void,
    private readonly warn: (message: string, details?: unknown) => void,
    private readonly isDuplicateEvent: (eventId: string) => boolean
  ) {
    this.status = {
      url,
      phase: 'stopped',
      attempt: 0,
      lastFrameAt: null,
      lastEventAt: null,
      lastCloseReason: null,
      lastError: null,
      nextReconnectAt: null
    }
  }

  start() {
    const pubkey = this.getPubkey()
    if (!pubkey) {
      this.stop('missing active pubkey')
      return
    }

    this.stopped = false
    const generation = ++this.connectGeneration
    this.clearReconnectTimer()
    void this.connect(pubkey, generation)
  }

  stop(reason: string) {
    this.stopped = true
    this.connectGeneration += 1
    this.clearReconnectTimer()
    this.detachSocket()

    if (this.subscription) {
      this.subscription.onclose = undefined
      this.subscription.close(reason)
      this.subscription = null
    }

    if (this.relay) {
      this.pool.close([this.url])
      this.relay = null
    }

    this.updateStatus({
      phase: 'stopped',
      nextReconnectAt: null,
      lastCloseReason: reason
    })
  }

  checkForStaleConnection(now: number) {
    if (this.stopped || this.status.phase !== 'connected' || !this.status.lastFrameAt) {
      return
    }

    const idleMs = now - this.status.lastFrameAt
    if (idleMs < STALE_RELAY_TIMEOUT_MS) {
      return
    }

    this.warn('stale watchdog triggered reconnect', {
      url: this.url,
      idleMs
    })
    this.forceReconnect('stale watchdog')
  }

  private async connect(pubkey: string, generation: number) {
    this.updateStatus({
      phase: 'connecting',
      nextReconnectAt: null,
      lastCloseReason: null
    })

    try {
      const relay = await this.pool.ensureRelay(this.url)

      if (this.stopped || generation !== this.connectGeneration) {
        return
      }

      this.relay = relay
      this.attachSocket(relay)
      relay.onnotice = (message: string) => {
        this.noteFrame()
        this.debug('relay notice', {
          url: this.url,
          message
        })
      }

      this.noteFrame()
      this.updateStatus({
        phase: 'connected',
        attempt: 0,
        nextReconnectAt: null,
        lastError: null
      })
      this.debug('relay connected', {
        url: this.url
      })

      const since = this.getSinceUnix()
      this.subscription = relay.subscribe(
        [
          {
            kinds: [kinds.Reaction],
            '#p': [pubkey],
            since
          }
        ],
        {
          receivedEvent: () => {
            this.noteFrame()
          },
          oneose: () => {
            this.noteFrame()
          },
          onevent: (event: NostrEvent) => {
            this.noteFrame()
            this.status.lastEventAt = Date.now()
            this.onStatusChange()

            this.debug('event received', {
              url: this.url,
              eventId: event.id,
              authorPubkey: event.pubkey
            })

            const payload = getLiveReactionFountainPayloadFromEvent(event, {
              activePubkey: this.getPubkey(),
              relayUrl: this.url
            })
            if (!payload) {
              return
            }

            if (this.isDuplicateEvent(payload.id)) {
              this.debug('duplicate event ignored', {
                url: this.url,
                eventId: payload.id
              })
              return
            }

            this.onPayload(payload)
          },
          onclose: (reason: string) => {
            if (generation !== this.connectGeneration) {
              return
            }

            this.detachSocket()
            this.subscription = null
            this.relay = null

            if (this.stopped) {
              this.updateStatus({
                phase: 'stopped',
                lastCloseReason: reason,
                nextReconnectAt: null
              })
              return
            }

            this.warn('relay closed/error', {
              url: this.url,
              reason
            })
            this.scheduleReconnect(reason)
          },
          eoseTimeout: 10_000
        }
      )
    } catch (error) {
      if (generation !== this.connectGeneration || this.stopped) {
        return
      }

      const lastError = stringifyError(error)
      this.warn('relay closed/error', {
        url: this.url,
        reason: lastError
      })
      this.scheduleReconnect(lastError)
    }
  }

  private forceReconnect(reason: string) {
    const pubkey = this.getPubkey()
    if (!pubkey || this.stopped) {
      return
    }

    this.detachSocket()

    if (this.subscription) {
      this.subscription.onclose = undefined
      this.subscription.close(reason)
      this.subscription = null
    }

    if (this.relay) {
      this.pool.close([this.url])
      this.relay = null
    }

    this.scheduleReconnect(reason)
  }

  private scheduleReconnect(reason: string) {
    if (this.stopped) {
      return
    }

    const nextAttempt = this.status.attempt + 1
    const reconnectDelayMs = getReconnectDelayMs(nextAttempt)
    const nextReconnectAt = Date.now() + reconnectDelayMs

    this.clearReconnectTimer()
    this.updateStatus({
      phase: 'backoff',
      attempt: nextAttempt,
      nextReconnectAt,
      lastCloseReason: reason,
      lastError: reason
    })

    this.reconnectTimer = window.setTimeout(() => {
      const pubkey = this.getPubkey()
      if (!pubkey || this.stopped) {
        return
      }

      const generation = ++this.connectGeneration
      void this.connect(pubkey, generation)
    }, reconnectDelayMs)
  }

  private noteFrame() {
    this.status.lastFrameAt = Date.now()
    this.onStatusChange()
  }

  private attachSocket(relay: AbstractRelay) {
    this.detachSocket()

    const socket = (relay as unknown as { ws?: WebSocket }).ws
    if (!socket || typeof socket.addEventListener !== 'function') {
      return
    }

    this.socket = socket
    socket.addEventListener('message', this.socketMessageListener)
  }

  private detachSocket() {
    if (this.socket) {
      this.socket.removeEventListener('message', this.socketMessageListener)
      this.socket = null
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private updateStatus(partialStatus: Partial<TLiveReactionRelayStatus>) {
    Object.assign(this.status, partialStatus)
    this.onStatusChange()
  }
}

export class LiveReactionFountainService {
  private readonly pool = new SmartPool()
  private readonly payloadListeners = new Set<TPayloadListener>()
  private readonly statusListeners = new Set<TStatusListener>()
  private readonly seenEventIdMap = new BoundedMap<string, number>(EVENT_DEDUPE_CACHE_SIZE)
  private readonly relayConnections = new Map<string, RelayConnection>()
  private readonly clientEventListener = (event: Event) => {
    const nextEvent = (event as CustomEvent<NostrEvent>).detail
    if (nextEvent.kind !== kinds.Reaction || !this.shouldRun()) {
      return
    }

    const payload = getLiveReactionFountainPayloadFromEvent(nextEvent, {
      activePubkey: this.runtimeState.pubkey,
      relayUrl: 'client:newEvent'
    })
    if (!payload) {
      return
    }

    this.debug('event received', {
      url: 'client:newEvent',
      eventId: payload.id,
      authorPubkey: payload.authorPubkey
    })

    if (this.isDuplicateEvent(payload.id)) {
      this.debug('duplicate event ignored', {
        url: 'client:newEvent',
        eventId: payload.id
      })
      return
    }

    this.cursorSinceUnix = Math.max(this.cursorSinceUnix, payload.createdAt)
    this.payloadListeners.forEach((listener) => listener(payload))
  }
  private runtimeState: TRuntimeState = {
    enabled: false,
    appActive: true,
    pubkey: null,
    relayUrls: []
  }
  private cursorSinceUnix = Math.floor((Date.now() - FRESH_START_LOOKBACK_MS) / 1000)
  private watchdogTimer: number | null = null
  private running = false
  private relayUrlSignature = ''

  constructor() {
    this.ensureWatchdog()
    client.addEventListener('newEvent', this.clientEventListener as EventListener)
  }

  updateRuntime(partialState: Partial<TRuntimeState>) {
    const previousState = this.runtimeState
    const nextRelayUrls = partialState.relayUrls
      ? normalizeRelayUrls(partialState.relayUrls)
      : this.runtimeState.relayUrls

    this.runtimeState = {
      enabled: partialState.enabled ?? this.runtimeState.enabled,
      appActive: partialState.appActive ?? this.runtimeState.appActive,
      pubkey: partialState.pubkey !== undefined ? partialState.pubkey : this.runtimeState.pubkey,
      relayUrls: nextRelayUrls
    }

    const nextSignature = nextRelayUrls.join('|')
    const pubkeyChanged = previousState.pubkey !== this.runtimeState.pubkey
    const shouldRunNow = this.shouldRun()
    const shouldRunBefore =
      previousState.enabled &&
      previousState.appActive &&
      !!previousState.pubkey &&
      previousState.relayUrls.length > 0

    if (!shouldRunNow) {
      if (this.running) {
        this.debug('subscription stopped', {
          reason: this.describeStopReason()
        })
      }
      this.running = false
      this.stopAll('live reaction fountain inactive')
      this.relayUrlSignature = nextSignature
      return
    }

    if (!shouldRunBefore) {
      this.resetSinceCursor()
      this.running = true
      this.debug('subscription started', {
        relayCount: this.runtimeState.relayUrls.length,
        pubkey: this.runtimeState.pubkey
      })
      this.syncRelayConnections()
      this.relayUrlSignature = nextSignature
      return
    }

    if (pubkeyChanged) {
      this.resetSinceCursor()
      this.restartAll('active account changed')
    } else if (nextSignature !== this.relayUrlSignature) {
      this.syncRelayConnections()
    }

    this.running = true
    this.relayUrlSignature = nextSignature
  }

  revalidate(reason: string) {
    if (!this.shouldRun()) {
      return
    }

    this.debug('subscription started', {
      reason,
      relayCount: this.runtimeState.relayUrls.length,
      pubkey: this.runtimeState.pubkey
    })
    this.resetSinceCursor()
    this.restartAll(reason)
  }

  subscribe(listener: TPayloadListener) {
    this.payloadListeners.add(listener)
    return () => {
      this.payloadListeners.delete(listener)
    }
  }

  subscribeStatus(listener: TStatusListener) {
    this.statusListeners.add(listener)
    listener(this.getRelayStatuses())
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  getRelayStatuses() {
    return Array.from(this.relayConnections.values())
      .map((connection) => ({ ...connection.status }))
      .sort((left, right) => left.url.localeCompare(right.url))
  }

  dispose() {
    this.stopAll('live reaction fountain disposed')
    if (this.watchdogTimer !== null) {
      window.clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    client.removeEventListener('newEvent', this.clientEventListener as EventListener)
    this.pool.destroy()
  }

  private shouldRun() {
    return (
      this.runtimeState.enabled &&
      this.runtimeState.appActive &&
      !!this.runtimeState.pubkey &&
      this.runtimeState.relayUrls.length > 0
    )
  }

  private stopAll(reason: string) {
    this.relayConnections.forEach((connection) => {
      connection.stop(reason)
    })
    this.relayConnections.clear()
    this.emitStatuses()
  }

  private restartAll(reason: string) {
    const nextRelayUrls = [...this.runtimeState.relayUrls]
    this.stopAll(reason)
    nextRelayUrls.forEach((url) => {
      const connection = this.createRelayConnection(url)
      this.relayConnections.set(url, connection)
      connection.start()
    })
    this.emitStatuses()
  }

  private syncRelayConnections() {
    const desiredUrls = new Set(this.runtimeState.relayUrls)

    Array.from(this.relayConnections.entries()).forEach(([url, connection]) => {
      if (desiredUrls.has(url)) {
        return
      }

      connection.stop('relay removed from reaction fountain target set')
      this.relayConnections.delete(url)
    })

    this.runtimeState.relayUrls.forEach((url) => {
      if (this.relayConnections.has(url)) {
        return
      }

      const connection = this.createRelayConnection(url)
      this.relayConnections.set(url, connection)
      connection.start()
    })

    this.emitStatuses()
  }

  private createRelayConnection(url: string) {
    return new RelayConnection(
      url,
      this.pool,
      (payload) => {
        this.cursorSinceUnix = Math.max(this.cursorSinceUnix, payload.createdAt)
        this.payloadListeners.forEach((listener) => listener(payload))
      },
      () => {
        this.emitStatuses()
      },
      () => this.runtimeState.pubkey,
      () => this.cursorSinceUnix,
      (message, details) => {
        console.debug('[LiveReactionFountain]', message, details)
      },
      (message, details) => {
        console.warn('[LiveReactionFountain]', message, details)
      },
      (eventId) => this.isDuplicateEvent(eventId)
    )
  }

  private emitStatuses() {
    const statuses = this.getRelayStatuses()
    this.statusListeners.forEach((listener) => listener(statuses))
  }

  private isDuplicateEvent(eventId: string) {
    if (this.seenEventIdMap.has(eventId)) {
      return true
    }

    this.seenEventIdMap.set(eventId, Date.now())
    return false
  }

  private ensureWatchdog() {
    if (this.watchdogTimer !== null) {
      return
    }

    this.watchdogTimer = window.setInterval(() => {
      if (!this.running) {
        return
      }

      const now = Date.now()
      this.relayConnections.forEach((connection) => {
        connection.checkForStaleConnection(now)
      })
    }, WATCHDOG_INTERVAL_MS)
  }

  private resetSinceCursor() {
    this.cursorSinceUnix = Math.floor((Date.now() - FRESH_START_LOOKBACK_MS) / 1000)
  }

  private describeStopReason() {
    if (!this.runtimeState.enabled) return 'setting disabled'
    if (!this.runtimeState.appActive) return 'app inactive'
    if (!this.runtimeState.pubkey) return 'signed out'
    if (this.runtimeState.relayUrls.length === 0) return 'no relay targets'
    return 'unknown'
  }

  private debug(message: string, details?: unknown) {
    console.debug('[LiveReactionFountain]', message, details)
  }
}

function normalizeRelayUrls(relayUrls: string[]) {
  return Array.from(
    new Set(
      relayUrls
        .map((url) => normalizeUrl(url))
        .filter((url): url is string => !!url && isWebsocketUrl(url))
    )
  )
}

function getReconnectDelayMs(attempt: number) {
  const exponentialBackoffMs = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  )
  const jitterMs = Math.round(exponentialBackoffMs * 0.2 * Math.random())
  return exponentialBackoffMs + jitterMs
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
