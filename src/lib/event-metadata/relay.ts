import { DEFAULT_READ_RELAY_URLS, DEFAULT_WRITE_RELAY_URLS, ExtendedKind } from '@/constants'
import { TRelayDiscovery, TRelayList, TRelaySet } from '@/types'
import type { Event } from 'nostr-tools'
import { buildATag } from '../draft-event.tags'
import { getReplaceableEventIdentifier } from '../event'
import { isWebsocketUrl, normalizeUrl } from '../url'
import { isTorBrowser } from '../utils'
import { tagNameEquals } from '../tag'

export function getRelayListFromEvent(event?: Event | null) {
  const defaultOriginalRelays = buildDefaultRelayList()

  if (!event) {
    return {
      write: DEFAULT_WRITE_RELAY_URLS,
      read: DEFAULT_READ_RELAY_URLS,
      originalRelays: defaultOriginalRelays
    }
  }

  const torBrowserDetected = isTorBrowser()
  const writeSet = new Set<string>()
  const readSet = new Set<string>()
  const relayScopeMap = new Map<string, TRelayList['originalRelays'][number]['scope']>()

  event.tags.filter(tagNameEquals('r')).forEach(([, url, type]) => {
    if (!url || !isWebsocketUrl(url)) return

    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) return

    const scope = type === 'read' ? 'read' : type === 'write' ? 'write' : 'both'
    relayScopeMap.set(normalizedUrl, mergeRelayScopes(relayScopeMap.get(normalizedUrl), scope))

    if (normalizedUrl.endsWith('.onion/') && !torBrowserDetected) return

    if (type === 'write') {
      writeSet.add(normalizedUrl)
    } else if (type === 'read') {
      readSet.add(normalizedUrl)
    } else {
      writeSet.add(normalizedUrl)
      readSet.add(normalizedUrl)
    }
  })

  const originalRelays = Array.from(relayScopeMap.entries()).map(([url, scope]) => ({ url, scope }))
  const write = Array.from(writeSet)
  const read = Array.from(readSet)

  return {
    write: write.length && write.length <= 8 ? write : DEFAULT_WRITE_RELAY_URLS,
    read: read.length && read.length <= 8 ? read : DEFAULT_READ_RELAY_URLS,
    originalRelays: originalRelays.length ? originalRelays : defaultOriginalRelays
  }
}

export function getInboxRelayUrlsFromEvent(event?: Event | null) {
  if (!event || event.kind !== ExtendedKind.INBOX_RELAYS) {
    return []
  }

  const torBrowserDetected = isTorBrowser()
  const relaySet = new Set<string>()

  event.tags.filter(tagNameEquals('relay')).forEach(([, url]) => {
    if (!url || !isWebsocketUrl(url)) return

    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) return

    if (normalizedUrl.endsWith('.onion/') && !torBrowserDetected) return

    relaySet.add(normalizedUrl)
  })

  return Array.from(relaySet)
}

export function getRelayDiscoveryFromEvent(event?: Event | null): TRelayDiscovery | null {
  if (!event || event.kind !== ExtendedKind.RELAY_DISCOVERY) {
    return null
  }

  const torBrowserDetected = isTorBrowser()
  const dTagValue = event.tags.find(([tagName]) => tagName === 'd')?.[1]
  if (!dTagValue || !isWebsocketUrl(dTagValue)) {
    return null
  }

  const normalizedUrl = normalizeUrl(dTagValue)
  if (!normalizedUrl) {
    return null
  }

  if (normalizedUrl.endsWith('.onion/') && !torBrowserDetected) {
    return null
  }

  const supportedNips = new Set<number>()
  const requirementFlags = new Set<string>()
  const relayTypes = new Set<string>()
  const acceptedKinds = new Set<number>()
  const rejectedKinds = new Set<number>()
  let rttOpen: number | undefined
  let rttRead: number | undefined
  let rttWrite: number | undefined

  event.tags.forEach(([tagName, ...values]) => {
    if (!values.length) return

    if (tagName === 'N') {
      const supportedNip = Number.parseInt(values[0], 10)
      if (Number.isFinite(supportedNip)) {
        supportedNips.add(supportedNip)
      }
      return
    }

    if (tagName === 'R') {
      if (values[0]) requirementFlags.add(values[0])
      return
    }

    if (tagName === 'T') {
      if (values[0]) relayTypes.add(values[0])
      return
    }

    if (tagName === 'k') {
      const rawKindValue = values[0]
      if (!rawKindValue) return

      const isRejected = rawKindValue.startsWith('!')
      const parsedKind = Number.parseInt(isRejected ? rawKindValue.slice(1) : rawKindValue, 10)
      if (!Number.isFinite(parsedKind)) return

      if (isRejected) {
        rejectedKinds.add(parsedKind)
      } else {
        acceptedKinds.add(parsedKind)
      }
      return
    }

    if (tagName === 'rtt-open') {
      const value = Number.parseInt(values[0], 10)
      if (Number.isFinite(value)) {
        rttOpen = value
      }
      return
    }

    if (tagName === 'rtt-read') {
      const value = Number.parseInt(values[0], 10)
      if (Number.isFinite(value)) {
        rttRead = value
      }
      return
    }

    if (tagName === 'rtt-write') {
      const value = Number.parseInt(values[0], 10)
      if (Number.isFinite(value)) {
        rttWrite = value
      }
    }
  })

  return {
    url: normalizedUrl,
    supportedNips: Array.from(supportedNips),
    requirementFlags: Array.from(requirementFlags),
    relayTypes: Array.from(relayTypes),
    acceptedKinds: Array.from(acceptedKinds),
    rejectedKinds: Array.from(rejectedKinds),
    rttOpen,
    rttRead,
    rttWrite,
    created_at: event.created_at
  }
}

export function getRelaySetFromEvent(event: Event): TRelaySet {
  const id = getReplaceableEventIdentifier(event)
  const relayUrls = event.tags
    .filter(tagNameEquals('relay'))
    .map((tag) => tag[1])
    .filter((url) => url && isWebsocketUrl(url))
    .map((url) => normalizeUrl(url))

  let name = event.tags.find(tagNameEquals('title'))?.[1]
  if (!name) {
    name = id
  }

  return { id, name, relayUrls, aTag: buildATag(event) }
}

function buildDefaultRelayList() {
  const scopeMap = new Map<string, 'read' | 'write' | 'both'>()

  DEFAULT_READ_RELAY_URLS.forEach((url) => {
    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl) {
      scopeMap.set(normalizedUrl, mergeRelayScopes(scopeMap.get(normalizedUrl), 'read'))
    }
  })

  DEFAULT_WRITE_RELAY_URLS.forEach((url) => {
    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl) {
      scopeMap.set(normalizedUrl, mergeRelayScopes(scopeMap.get(normalizedUrl), 'write'))
    }
  })

  return Array.from(scopeMap.entries()).map(([url, scope]) => ({ url, scope }))
}

function mergeRelayScopes(
  existingScope: 'read' | 'write' | 'both' | undefined,
  nextScope: 'read' | 'write' | 'both'
) {
  if (!existingScope || existingScope === nextScope) return nextScope
  if (existingScope === 'both' || nextScope === 'both') return 'both'
  return 'both'
}
