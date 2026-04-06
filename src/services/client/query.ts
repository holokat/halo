import { BIG_RELAY_URLS } from '@/constants'
import { filterExpiredEvents } from '@/lib/event-expiration'
import { SmartPool } from '@/lib/smart-pool'
import { ISigner } from '@/types'
import { EventTemplate, Filter, Event as NEvent, VerifiedEvent } from 'nostr-tools'
import { AbstractRelay } from 'nostr-tools/abstract-relay'

export interface ClientQueryHost {
  pool: SmartPool
  signer?: ISigner
  trackEventSeenOn(eventId: string, relay: AbstractRelay): void
}

type TSubscribeOptions = {
  startLogin?: () => void
  onAllClose?: (reasons: string[]) => void
}

type TSubscribeCallbacks = {
  onevent?: (evt: NEvent) => void
  oneose?: (eosed: boolean) => void
  onclose?: (url: string, reason: string) => void
}

type TQueryOptions = {
  timeoutMs?: number
  eoseThreshold?: number
}

export function querySync(host: ClientQueryHost, relayUrls: string[], filter: Filter) {
  return host.pool.querySync(relayUrls, filter).then((events) => filterExpiredEvents(events))
}

export function subscribe(
  host: ClientQueryHost,
  urls: string[],
  filter: Filter | Filter[],
  { onevent, oneose, onclose, startLogin, onAllClose }: TSubscribeCallbacks & TSubscribeOptions
) {
  const relays = Array.from(new Set(urls))
  const filters = Array.isArray(filter) ? filter : [filter]

  const that = host
  const _knownIds = new Set<string>()
  let startedCount = 0
  let eosedCount = 0
  let eosed = false
  let closedCount = 0
  const closeReasons: string[] = []
  const subPromises: Promise<{ close: () => void }>[] = []
  relays.forEach((url) => {
    let hasAuthed = false

    subPromises.push(startSub())

    async function startSub() {
      startedCount++
      const relay = await that.pool.ensureRelay(url).catch(() => undefined)
      if (!relay) {
        if (!eosed) {
          eosedCount++
          eosed = eosedCount >= startedCount
          oneose?.(eosed)
        }
        return {
          close: () => {}
        }
      }

      return relay.subscribe(filters, {
        receivedEvent: (relay, id) => {
          that.trackEventSeenOn(id, relay)
        },
        alreadyHaveEvent: (id: string) => {
          const have = _knownIds.has(id)
          if (have) {
            return true
          }
          _knownIds.add(id)
          return false
        },
        onevent: (evt: NEvent) => {
          onevent?.(evt)
        },
        oneose: () => {
          if (eosed) return
          eosedCount++
          eosed = eosedCount >= startedCount
          oneose?.(eosed)
        },
        onclose: (reason: string) => {
          if (reason.startsWith('auth-required') && !hasAuthed) {
            if (that.signer) {
              relay
                .auth(async (authEvt: EventTemplate) => {
                  const evt = await that.signer!.signEvent(authEvt)
                  if (!evt) {
                    throw new Error('sign event failed')
                  }
                  return evt as VerifiedEvent
                })
                .then(() => {
                  hasAuthed = true
                  if (!eosed) {
                    subPromises.push(startSub())
                  }
                })
                .catch(() => {
                  // ignore
                })
              return
            }

            if (startLogin) {
              startLogin()
              return
            }
          }

          closedCount++
          closeReasons.push(reason)
          onclose?.(url, reason)
          if (closedCount >= startedCount) {
            onAllClose?.(closeReasons)
          }
        },
        eoseTimeout: 10_000
      })
    }
  })

  return {
    close: () => {
      subPromises.forEach((subPromise) => {
        subPromise
          .then((sub) => {
            sub.close()
          })
          .catch((err) => {
            console.error(err)
          })
      })
    }
  }
}

export async function query(
  host: ClientQueryHost,
  urls: string[],
  filter: Filter | Filter[],
  onevent?: (evt: NEvent) => void,
  {
    timeoutMs,
    eoseThreshold
  }: TQueryOptions = {}
): Promise<NEvent[]> {
  return await new Promise<NEvent[]>((resolve) => {
    const events: NEvent[] = []
    const relayCount = Array.from(new Set(urls)).length
    const resolvedThreshold = Math.max(
      1,
      Math.min(
        relayCount,
        Number.isFinite(eoseThreshold)
          ? Math.ceil(relayCount * (eoseThreshold as number))
          : relayCount
      )
    )
    let eoseCount = 0
    let done = false
    let timeout: number | undefined
    let sub: { close: () => void } | null = null

    const finish = () => {
      if (done) return
      done = true
      if (timeout) {
        window.clearTimeout(timeout)
      }
      sub?.close()
      resolve(events)
    }

    if (timeoutMs && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeout = window.setTimeout(() => {
        finish()
      }, timeoutMs)
    }

    sub = subscribe(host, urls, filter, {
      onevent(evt) {
        onevent?.(evt)
        events.push(evt)
      },
      oneose: (eosed) => {
        if (done) return
        eoseCount += 1
        if (eosed || eoseCount >= resolvedThreshold) {
          finish()
        }
      },
      onAllClose: () => {
        finish()
      }
    })
  })
}

export function defaultRelayUrls(urls: string[]) {
  return urls.length > 0 ? urls : BIG_RELAY_URLS
}
