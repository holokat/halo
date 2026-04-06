import { MAX_PINNED_NOTES, POLL_TYPE, ExtendedKind } from '@/constants'
import type { TEmoji, TPollOption, TPollType } from '@/types'
import { kinds } from 'nostr-tools'
import type { Event } from 'nostr-tools'
import { getAmountFromInvoice, getLightningAddressFromProfile } from '../lightning'
import { formatPubkey, pubkeyToNpub } from '../pubkey'
import { generateBech32IdFromETag, tagNameEquals } from '../tag'
import { normalizeHttpUrl, normalizeUrl } from '../url'

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
        continue
      }
      selectedOptionIds.push(tagValues[0])
    }
  }

  if (selectedOptionIds.length === 0) {
    return null
  }

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
      .slice(0, MAX_PINNED_NOTES)
  )
}
