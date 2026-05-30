import { BIG_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'
import { Event as NostrEvent, nip19 } from 'nostr-tools'

export const DEFAULT_LIVE_RELAYS = ['wss://relay.damus.io/', 'wss://nos.lol/', 'wss://relay.nostr.band/']
export const FAST_LIVE_RELAYS = ['wss://relay.snort.social/', 'wss://relay.primal.net/', 'wss://nostr.wine/']
export const LIVE_STREAM_LOADING_TIMEOUT = 15_000

export type DecodedLiveAddress = {
  identifier: string
  pubkey: string
  kind: number
  relays?: string[]
}

export function decodeLiveNaddr(naddr?: string): DecodedLiveAddress | null {
  if (!naddr) return null

  try {
    const decoded = nip19.decode(naddr)
    if (decoded.type !== 'naddr') return null
    return decoded.data as DecodedLiveAddress
  } catch {
    return null
  }
}

export function getAddressTag(decoded: DecodedLiveAddress): string {
  return `${decoded.kind}:${decoded.pubkey}:${decoded.identifier}`
}

export function getEventTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find((tag) => tag[0] === tagName)?.[1]
}

export function isMatchingLiveAddress(event: NostrEvent, decoded: DecodedLiveAddress): boolean {
  return (
    event.kind === decoded.kind &&
    event.pubkey === decoded.pubkey &&
    getEventTagValue(event, 'd') === decoded.identifier
  )
}

export function getStreamRelays(decoded: DecodedLiveAddress): string[] {
  const relayCandidates = [
    ...(decoded.relays ?? []),
    ...DEFAULT_LIVE_RELAYS,
    ...BIG_RELAY_URLS,
    'wss://relay.snort.social/',
    'wss://relay.primal.net/',
    'wss://nostr.wine/'
  ]

  const normalized = relayCandidates
    .map((relay) => normalizeUrl(relay))
    .filter((relay): relay is string => relay.length > 0)

  return Array.from(new Set(normalized))
}

export function getPrimaryStreamRelays(decoded: DecodedLiveAddress, initialEvent?: NostrEvent): string[] {
  const eventRelayHints = initialEvent?.tags.find((tag) => tag[0] === 'relays')?.slice(1) ?? []
  const relayCandidates = [
    ...eventRelayHints,
    ...(decoded.relays ?? []),
    ...DEFAULT_LIVE_RELAYS,
    ...FAST_LIVE_RELAYS
  ]

  const normalized = relayCandidates
    .map((relay) => normalizeUrl(relay))
    .filter((relay): relay is string => relay.length > 0)

  return Array.from(new Set(normalized)).slice(0, 3)
}

export function formatMediaTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '0:00'
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
