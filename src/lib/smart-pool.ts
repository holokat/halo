import { SimplePool } from 'nostr-tools'
import { AbstractRelay } from 'nostr-tools/abstract-relay'
import { normalizeRelayConnectionUrl } from '@/lib/url'

const DEFAULT_CONNECTION_TIMEOUT = 5_000
const CLEANUP_THRESHOLD = 15
const CLEANUP_INTERVAL = 30_000
const IDLE_TIMEOUT = 10_000

export class SmartPool extends SimplePool {
  private relayIdleTracker = new Map<string, number>()

  constructor() {
    super({ enablePing: true })

    // Keep relay count bounded on long sessions.
    const cleanupInterval = setInterval(() => this.cleanIdleRelays(), CLEANUP_INTERVAL)
    cleanupInterval.unref?.()
  }

  ensureRelay(url: string): Promise<AbstractRelay> {
    const connectionUrl = normalizeRelayConnectionUrl(url)
    if (!connectionUrl) {
      return Promise.reject(new Error('Invalid relay URL'))
    }

    if (
      !this.relayIdleTracker.has(connectionUrl) &&
      this.relayIdleTracker.size > CLEANUP_THRESHOLD
    ) {
      this.cleanIdleRelays()
    }
    this.relayIdleTracker.set(connectionUrl, Date.now())
    return super.ensureRelay(connectionUrl, { connectionTimeout: DEFAULT_CONNECTION_TIMEOUT })
  }

  close(relayUrls: string[]) {
    const connectionUrls = relayUrls
      .map((url) => normalizeRelayConnectionUrl(url))
      .filter((url): url is string => Boolean(url))

    connectionUrls.forEach((url) => this.relayIdleTracker.delete(url))
    super.close(connectionUrls)
  }

  getTrackedRelayUrls() {
    return Array.from(this.relays.keys())
  }

  getTrackedRelayStates() {
    return Array.from(this.relays.values()).map((relay) => ({
      url: relay.url,
      connected: relay.connected,
      subscriptionCount: relay.openSubs.size
    }))
  }

  private cleanIdleRelays() {
    const idleRelays: string[] = []
    this.relays.forEach((relay, url) => {
      if (!relay.connected || relay.openSubs.size > 0) return

      const lastActivity = this.relayIdleTracker.get(url) ?? 0
      if (Date.now() - lastActivity < IDLE_TIMEOUT) return

      idleRelays.push(url)
      this.relayIdleTracker.delete(url)
    })

    if (idleRelays.length > 0) {
      this.close(idleRelays)
    }
  }
}
