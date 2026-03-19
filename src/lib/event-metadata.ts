import {
  BIG_RELAY_URLS,
  DEFAULT_READ_RELAY_URLS,
  DEFAULT_WRITE_RELAY_URLS,
  ExtendedKind,
  MAX_PINNED_NOTES,
  POLL_TYPE
} from '@/constants'
import { TEmoji, TPollOption, TPollType, TRelayDiscovery, TRelayList, TRelaySet } from '@/types'
import { Event, kinds } from 'nostr-tools'
import { buildATag } from './draft-event'
import { getReplaceableEventIdentifier } from './event'
import { getAmountFromInvoice, getLightningAddressFromProfile } from './lightning'
import { formatPubkey, pubkeyToNpub } from './pubkey'
import { generateBech32IdFromETag, tagNameEquals } from './tag'
import { isWebsocketUrl, normalizeHttpUrl, normalizeUrl } from './url'
import { isTorBrowser } from './utils'

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

    // Filter out .onion URLs if not using Tor browser
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

  // If there are too many relays, use the default BIG_RELAY_URLS
  // Because they don't know anything about relays, their settings cannot be trusted
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
      if (values[0]) {
        requirementFlags.add(values[0])
      }
      return
    }

    if (tagName === 'T') {
      if (values[0]) {
        relayTypes.add(values[0])
      }
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

export function getProfileFromEvent(event: Event) {
  try {
    const profileObj = JSON.parse(event.content)
    const username =
      profileObj.display_name?.trim() ||
      profileObj.name?.trim() ||
      profileObj.nip05?.split('@')[0]?.trim()

    return {
      pubkey: event.pubkey,
      npub: pubkeyToNpub(event.pubkey) ?? '',
      banner: profileObj.banner,
      avatar: profileObj.picture,
      username: username || formatPubkey(event.pubkey),
      original_username: username,
      nip05: profileObj.nip05,
      about: profileObj.about,
      website: profileObj.website ? normalizeHttpUrl(profileObj.website) : undefined,
      lud06: profileObj.lud06,
      lud16: profileObj.lud16,
      lightningAddress: getLightningAddressFromProfile(profileObj),
      created_at: event.created_at,
      gallery: profileObj.gallery || undefined,
      joined_through: profileObj.joined_through || undefined,
      joined_at: profileObj.joined_at || undefined
    }
  } catch (err) {
    console.error(event.content, err)
    return {
      pubkey: event.pubkey,
      npub: pubkeyToNpub(event.pubkey) ?? '',
      username: formatPubkey(event.pubkey)
    }
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

export function getZapInfoFromEvent(receiptEvent: Event) {
  if (receiptEvent.kind !== kinds.Zap) return null

  let senderPubkey: string | undefined
  let recipientPubkey: string | undefined
  let originalEventId: string | undefined
  let eventId: string | undefined
  let invoice: string | undefined
  let amount: number | undefined
  let comment: string | undefined
  let description: string | undefined
  let preimage: string | undefined
  let pollOptionId: string | undefined
  try {
    receiptEvent.tags.forEach((tag) => {
      const [tagName, tagValue] = tag
      switch (tagName) {
        case 'P':
          senderPubkey = tagValue
          break
        case 'p':
          recipientPubkey = tagValue
          break
        case 'e':
          originalEventId = tag[1]
          eventId = generateBech32IdFromETag(tag)
          break
        case 'bolt11':
          invoice = tagValue
          break
        case 'description':
          description = tagValue
          break
        case 'preimage':
          preimage = tagValue
          break
      }
    })
    if (!recipientPubkey || !invoice) return null
    amount = invoice ? getAmountFromInvoice(invoice) : 0
    if (description) {
      try {
        const zapRequest = JSON.parse(description)
        comment = zapRequest.content
        if (!senderPubkey) {
          senderPubkey = zapRequest.pubkey
        }
        const pollOptionTag = Array.isArray(zapRequest.tags)
          ? zapRequest.tags.find(
              (tag: unknown): tag is string[] =>
                Array.isArray(tag) && tag[0] === 'poll_option' && typeof tag[1] === 'string'
            )
          : undefined
        pollOptionId = pollOptionTag?.[1]
      } catch {
        // ignore
      }
    }

    return {
      senderPubkey,
      recipientPubkey,
      eventId,
      originalEventId,
      invoice,
      amount,
      comment,
      pollOptionId,
      preimage
    }
  } catch {
    return null
  }
}

export function getLongFormArticleMetadataFromEvent(event: Event) {
  let title: string | undefined
  let summary: string | undefined
  let image: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'title') {
      title = tagValue
    } else if (tagName === 'summary') {
      summary = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    } else if (tagName === 't' && tagValue && tags.size < 6) {
      tags.add(tagValue.toLocaleLowerCase())
    }
  })

  if (!title) {
    title = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no title'
  }

  return { title, summary, image, tags: Array.from(tags) }
}

export function getLiveEventMetadataFromEvent(event: Event) {
  let title: string | undefined
  let summary: string | undefined
  let image: string | undefined
  let status: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'title') {
      title = tagValue
    } else if (tagName === 'summary') {
      summary = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    } else if (tagName === 'status') {
      status = tagValue
    } else if (tagName === 't' && tagValue && tags.size < 6) {
      tags.add(tagValue.toLocaleLowerCase())
    }
  })

  if (!title) {
    title = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no title'
  }

  return { title, summary, image, status, tags: Array.from(tags) }
}

export function getGroupMetadataFromEvent(event: Event) {
  let d: string | undefined
  let name: string | undefined
  let about: string | undefined
  let picture: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'name') {
      name = tagValue
    } else if (tagName === 'about') {
      about = tagValue
    } else if (tagName === 'picture') {
      picture = tagValue
    } else if (tagName === 't' && tagValue) {
      tags.add(tagValue.toLocaleLowerCase())
    } else if (tagName === 'd') {
      d = tagValue
    }
  })

  if (!name) {
    name = d ?? 'no name'
  }

  return { d, name, about, picture, tags: Array.from(tags) }
}

export function getCommunityDefinitionFromEvent(event: Event) {
  let name: string | undefined
  let description: string | undefined
  let image: string | undefined

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'name') {
      name = tagValue
    } else if (tagName === 'description') {
      description = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    }
  })

  if (!name) {
    name = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no name'
  }

  return { name, description, image }
}

export function getPollMetadataFromEvent(event: Event) {
  const options: TPollOption[] = []
  const optionImageMap = new Map<string, string>()
  const relayUrls: string[] = []
  const isLegacyZapPoll = event.kind === ExtendedKind.LEGACY_ZAP_POLL
  const format = isLegacyZapPoll ? 'legacy_zap' : 'nip88'
  let pollType: TPollType = POLL_TYPE.SINGLE_CHOICE
  let endsAt: number | undefined
  let minZapAmount: number | undefined
  let maxZapAmount: number | undefined
  let consensusThreshold: number | undefined

  for (const [tagName, ...tagValues] of event.tags) {
    if ((tagName === 'option' || tagName === 'poll_option') && tagValues.length >= 2) {
      const [optionId, label] = tagValues
      if (optionId && label) {
        options.push({ id: optionId, label })
      }
    } else if (tagName === 'option_image' && tagValues.length >= 2) {
      const [optionId, imageUrl] = tagValues
      const normalizedImageUrl = imageUrl ? normalizeHttpUrl(imageUrl) : undefined
      if (optionId && normalizedImageUrl) {
        optionImageMap.set(optionId, normalizedImageUrl)
      }
    } else if (tagName === 'relay' && tagValues[0]) {
      const normalizedUrl = normalizeUrl(tagValues[0])
      if (normalizedUrl) relayUrls.push(normalizedUrl)
    } else if (tagName === 'polltype' && tagValues[0]) {
      if (tagValues[0] === POLL_TYPE.MULTIPLE_CHOICE) {
        pollType = POLL_TYPE.MULTIPLE_CHOICE
      }
    } else if (isLegacyZapPoll && tagName === 'value_minimum' && tagValues[0]) {
      const valueMinimum = parseInt(tagValues[0])
      if (!isNaN(valueMinimum) && valueMinimum > 0) {
        minZapAmount = valueMinimum
      }
    } else if (isLegacyZapPoll && tagName === 'value_maximum' && tagValues[0]) {
      const valueMaximum = parseInt(tagValues[0])
      if (!isNaN(valueMaximum) && valueMaximum > 0) {
        maxZapAmount = valueMaximum
      }
    } else if (isLegacyZapPoll && tagName === 'consensus_threshold' && tagValues[0]) {
      const parsedValue = parseInt(tagValues[0])
      if (!isNaN(parsedValue) && parsedValue >= 0) {
        consensusThreshold = parsedValue / 100
      }
    } else if (tagName === 'endsAt' && tagValues[0]) {
      const timestamp = parseInt(tagValues[0])
      if (!isNaN(timestamp)) {
        endsAt = timestamp
      }
    } else if (isLegacyZapPoll && tagName === 'closed_at' && tagValues[0]) {
      const timestamp = parseInt(tagValues[0])
      if (!isNaN(timestamp)) {
        endsAt = timestamp
      }
    }
  }

  if (options.length === 0) {
    return null
  }

  return {
    format,
    options: options.map((option) => ({
      ...option,
      image: optionImageMap.get(option.id)
    })),
    pollType,
    relayUrls,
    endsAt,
    minZapAmount,
    maxZapAmount,
    consensusThreshold
  }
}

export function getPollResponseFromEvent(
  event: Event,
  optionIds: string[],
  isMultipleChoice: boolean
) {
  const selectedOptionIds: string[] = []

  for (const [tagName, ...tagValues] of event.tags) {
    if (tagName === 'response' && tagValues[0]) {
      if (optionIds && !optionIds.includes(tagValues[0])) {
        continue // Skip if the response is not in the provided optionIds
      }
      selectedOptionIds.push(tagValues[0])
    }
  }

  // If no valid responses are found, return null
  if (selectedOptionIds.length === 0) {
    return null
  }

  // If multiple responses are selected but the poll is not multiple choice, return null
  if (selectedOptionIds.length > 1 && !isMultipleChoice) {
    return null
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    selectedOptionIds,
    created_at: event.created_at
  }
}

export function getEmojisAndEmojiSetsFromEvent(event: Event) {
  const emojis: TEmoji[] = []
  const emojiSetPointers: string[] = []

  event.tags.forEach(([tagName, ...tagValues]) => {
    if (tagName === 'emoji' && tagValues.length >= 2) {
      emojis.push({
        shortcode: tagValues[0],
        url: tagValues[1]
      })
    } else if (tagName === 'a' && tagValues[0]) {
      emojiSetPointers.push(tagValues[0])
    }
  })

  return { emojis, emojiSetPointers }
}

export function getEmojisFromEvent(event: Event): TEmoji[] {
  const emojis: TEmoji[] = []

  event.tags.forEach(([tagName, ...tagValues]) => {
    if (tagName === 'emoji' && tagValues.length >= 2) {
      emojis.push({
        shortcode: tagValues[0],
        url: tagValues[1]
      })
    }
  })

  return emojis
}

export function getStarsFromRelayReviewEvent(event: Event): number {
  const ratingTag = event.tags.find((t) => t[0] === 'rating')
  if (ratingTag) {
    const stars = parseFloat(ratingTag[1]) * 5
    if (stars > 0 && stars <= 5) {
      return stars
    }
  }
  return 0
}

export function getPinnedEventHexIdSetFromPinListEvent(event?: Event | null): Set<string> {
  return new Set(
    event?.tags
      .filter((tag) => tag[0] === 'e')
      .map((tag) => tag[1])
      .reverse()
      .slice(0, MAX_PINNED_NOTES) ?? []
  )
}
