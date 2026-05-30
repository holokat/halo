import { MAX_PINNED_NOTES, POLL_TYPE, ExtendedKind } from '@/constants'
import type { TEmoji, TPollOption, TPollType } from '@/types'
import type { Event } from 'nostr-tools'
import { formatPubkey, pubkeyToNpub } from '../pubkey'
import { tagNameEquals } from '../tag'
import { normalizeHttpUrl, normalizeUrl } from '../url'

export function getProfileFromEvent(event: Event) {
  try {
    const profileObj = JSON.parse(event.content)
    const username = profileObj.display_name?.trim() || profileObj.name?.trim()

    return {
      pubkey: event.pubkey,
      npub: pubkeyToNpub(event.pubkey) ?? '',
      banner: profileObj.banner,
      avatar: profileObj.picture,
      username: username || formatPubkey(event.pubkey),
      original_username: username,
      about: profileObj.about,
      website: profileObj.website ? normalizeHttpUrl(profileObj.website) : undefined,
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
  let pollType: TPollType = POLL_TYPE.SINGLE_CHOICE
  let endsAt: number | undefined

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
    } else if (tagName === 'endsAt' && tagValues[0]) {
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
    format: 'nip88',
    options: options.map((option) => ({
      ...option,
      image: optionImageMap.get(option.id)
    })),
    pollType,
    relayUrls,
    endsAt
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
