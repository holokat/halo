import {
  ApplicationDataKey,
  ExtendedKind,
  POLL_TYPE
} from '@/constants'
import client from '@/services/client.service'
import mediaUpload from '@/services/media-upload.service'
import { TDraftEvent, TEmoji, TMailboxRelay, TPollCreateData, TRelaySet } from '@/types'
import { sha256 } from '@noble/hashes/sha2'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
import {
  getReplaceableCoordinateFromEvent,
  isProtectedEvent,
  isReplaceableEvent
} from './event'
import {
  transformCustomEmojisInContent
} from './draft-event.content'
import { extractImagesFromContent, extractTTagValues } from './draft-event.extractors'
import { extractCommentMentions, extractRelatedEventIds } from './draft-event.references'
import {
  buildATag,
  buildClientTag,
  buildDTag,
  buildEmojiTag,
  buildETag,
  buildITag,
  buildKTag,
  buildNsfwTag,
  buildPTag,
  buildProtectedTag,
  buildQTag,
  buildRTag,
  buildRelayTag,
  buildReplaceableQTag,
  buildResponseTag,
  buildServerTag,
  buildTTag,
  buildTitleTag
} from './draft-event.tags'
import { normalizePollOptions } from './poll'
import { randomString } from './random'
import { tagNameEquals } from './tag'

export { buildATag, buildETag } from './draft-event.tags'
export { transformCustomEmojisInContent } from './draft-event.content'

const draftEventCache: Map<string, string> = new Map()

export const NIP56_REPORT_TYPES = [
  'nudity',
  'malware',
  'profanity',
  'illegal',
  'spam',
  'impersonation',
  'other'
] as const

export type TNip56ReportType = (typeof NIP56_REPORT_TYPES)[number]

export function deleteDraftEventCache(draftEvent: TDraftEvent) {
  const key = generateDraftEventCacheKey(draftEvent)
  draftEventCache.delete(key)
}

function setDraftEventCache(baseDraft: Omit<TDraftEvent, 'created_at'>): TDraftEvent {
  const cacheKey = generateDraftEventCacheKey(baseDraft)
  const cache = draftEventCache.get(cacheKey)
  if (cache) {
    return JSON.parse(cache)
  }
  const draftEvent = { ...baseDraft, created_at: dayjs().unix() }
  draftEventCache.set(cacheKey, JSON.stringify(draftEvent))

  return draftEvent
}

function generateDraftEventCacheKey(draft: Omit<TDraftEvent, 'created_at'>) {
  const str = JSON.stringify({
    content: draft.content,
    kind: draft.kind,
    tags: draft.tags
  })

  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = sha256(data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// https://github.com/nostr-protocol/nips/blob/master/25.md
export function createReactionDraftEvent(event: Event, emoji: TEmoji | string = '+'): TDraftEvent {
  const tags: string[][] = []
  tags.push(buildETag(event.id, event.pubkey))
  tags.push(buildPTag(event.pubkey))
  if (event.kind !== kinds.ShortTextNote) {
    tags.push(buildKTag(event.kind))
  }

  if (isReplaceableEvent(event.kind)) {
    tags.push(buildATag(event))
  }

  let content: string
  if (typeof emoji === 'string') {
    content = emoji
  } else {
    content = `:${emoji.shortcode}:`
    tags.push(buildEmojiTag(emoji))
  }

  return {
    kind: kinds.Reaction,
    content,
    tags,
    created_at: dayjs().unix()
  }
}

// https://github.com/nostr-protocol/nips/blob/master/18.md
export function createRepostDraftEvent(event: Event): TDraftEvent {
  const isProtected = isProtectedEvent(event)
  const tags = [buildETag(event.id, event.pubkey), buildPTag(event.pubkey)]

  if (isReplaceableEvent(event.kind)) {
    tags.push(buildATag(event))
  }

  return {
    kind: kinds.Repost,
    content: isProtected ? '' : JSON.stringify(event),
    tags,
    created_at: dayjs().unix()
  }
}

export async function createShortTextNoteDraftEvent(
  content: string,
  mentions: string[],
  options: {
    parentEvent?: Event
    addClientTag?: boolean
    protectedEvent?: boolean
    isNsfw?: boolean
  } = {}
): Promise<TDraftEvent> {
  const { content: transformedEmojisContent, emojiTags } = transformCustomEmojisInContent(content)
  const { quoteEventHexIds, quoteReplaceableCoordinates, rootETag, parentETag } =
    await extractRelatedEventIds(transformedEmojisContent, options.parentEvent)
  const tTagValues = extractTTagValues(transformedEmojisContent)

  const tags = emojiTags.concat(tTagValues.map((value) => buildTTag(value)))

  // imeta tags
  const images = extractImagesFromContent(transformedEmojisContent)
  if (images && images.length) {
    tags.push(...generateImetaTags(images))
  }

  // q tags
  tags.push(...quoteEventHexIds.map((eventId) => buildQTag(eventId)))
  tags.push(...quoteReplaceableCoordinates.map((coordinate) => buildReplaceableQTag(coordinate)))

  // e tags
  if (rootETag.length) {
    tags.push(rootETag)
  }

  if (parentETag.length) {
    tags.push(parentETag)
  }

  // p tags
  tags.push(...mentions.map((pubkey) => buildPTag(pubkey)))

  if (options.addClientTag) {
    tags.push(buildClientTag())
  }

  if (options.isNsfw) {
    tags.push(buildNsfwTag())
  }

  if (options.protectedEvent) {
    tags.push(buildProtectedTag())
  }

  const baseDraft = {
    kind: kinds.ShortTextNote,
    content: transformedEmojisContent,
    tags
  }
  return setDraftEventCache(baseDraft)
}

// https://github.com/nostr-protocol/nips/blob/master/51.md
export function createRelaySetDraftEvent(relaySet: Omit<TRelaySet, 'aTag'>): TDraftEvent {
  return {
    kind: kinds.Relaysets,
    content: '',
    tags: [
      buildDTag(relaySet.id),
      buildTitleTag(relaySet.name),
      ...relaySet.relayUrls.map((url) => buildRelayTag(url))
    ],
    created_at: dayjs().unix()
  }
}

export async function createCommentDraftEvent(
  content: string,
  parentEvent: Event,
  mentions: string[],
  options: {
    addClientTag?: boolean
    protectedEvent?: boolean
    isNsfw?: boolean
  } = {}
): Promise<TDraftEvent> {
  const { content: transformedEmojisContent, emojiTags } = transformCustomEmojisInContent(content)
  const {
    quoteEventHexIds,
    quoteReplaceableCoordinates,
    rootEventId,
    rootCoordinateTag,
    rootKind,
    rootPubkey,
    rootUrl
  } = await extractCommentMentions(transformedEmojisContent, parentEvent)
  const tTagValues = extractTTagValues(transformedEmojisContent)

  const tags = emojiTags
    .concat(tTagValues.map((value) => buildTTag(value)))
    .concat(quoteEventHexIds.map((eventId) => buildQTag(eventId)))
    .concat(quoteReplaceableCoordinates.map((coordinate) => buildReplaceableQTag(coordinate)))

  const images = extractImagesFromContent(transformedEmojisContent)
  if (images && images.length) {
    tags.push(...generateImetaTags(images))
  }

  tags.push(
    ...mentions.filter((pubkey) => pubkey !== parentEvent.pubkey).map((pubkey) => buildPTag(pubkey))
  )

  if (rootCoordinateTag) {
    tags.push(rootCoordinateTag)
  } else if (rootEventId) {
    tags.push(buildETag(rootEventId, rootPubkey, '', true))
  }
  if (rootPubkey) {
    tags.push(buildPTag(rootPubkey, true))
  }
  if (rootKind) {
    tags.push(buildKTag(rootKind, true))
  }
  if (rootUrl) {
    tags.push(buildITag(rootUrl, true))
  }
  tags.push(
    ...[
      isReplaceableEvent(parentEvent.kind)
        ? buildATag(parentEvent)
        : buildETag(parentEvent.id, parentEvent.pubkey),
      buildKTag(parentEvent.kind),
      buildPTag(parentEvent.pubkey)
    ]
  )

  if (options.addClientTag) {
    tags.push(buildClientTag())
  }

  if (options.isNsfw) {
    tags.push(buildNsfwTag())
  }

  if (options.protectedEvent) {
    tags.push(buildProtectedTag())
  }

  const baseDraft = {
    kind: ExtendedKind.COMMENT,
    content: transformedEmojisContent,
    tags
  }
  return setDraftEventCache(baseDraft)
}

export function createRelayListDraftEvent(mailboxRelays: TMailboxRelay[]): TDraftEvent {
  return {
    kind: kinds.RelayList,
    content: '',
    tags: mailboxRelays.map(({ url, scope }) => buildRTag(url, scope)),
    created_at: dayjs().unix()
  }
}

export function createInboxRelayListDraftEvent(relayUrls: string[]): TDraftEvent {
  return {
    kind: ExtendedKind.INBOX_RELAYS,
    content: '',
    tags: relayUrls.map((url) => buildRelayTag(url)),
    created_at: dayjs().unix()
  }
}

export function createFollowListDraftEvent(tags: string[][], content?: string): TDraftEvent {
  return {
    kind: kinds.Contacts,
    content: content ?? '',
    created_at: dayjs().unix(),
    tags
  }
}

export function createMuteListDraftEvent(tags: string[][], content?: string): TDraftEvent {
  return {
    kind: kinds.Mutelist,
    content: content ?? '',
    created_at: dayjs().unix(),
    tags
  }
}

export function createProfileDraftEvent(content: string, tags: string[][] = []): TDraftEvent {
  return {
    kind: kinds.Metadata,
    content,
    tags,
    created_at: dayjs().unix()
  }
}

export function createFavoriteRelaysDraftEvent(
  favoriteRelays: string[],
  relaySetEventsOrATags: Event[] | string[][]
): TDraftEvent {
  const tags: string[][] = []
  favoriteRelays.forEach((url) => {
    tags.push(buildRelayTag(url))
  })
  relaySetEventsOrATags.forEach((eventOrATag) => {
    if (Array.isArray(eventOrATag)) {
      tags.push(eventOrATag)
    } else {
      tags.push(buildATag(eventOrATag))
    }
  })
  return {
    kind: ExtendedKind.FAVORITE_RELAYS,
    content: '',
    tags,
    created_at: dayjs().unix()
  }
}

export function createSeenNotificationsAtDraftEvent(): TDraftEvent {
  return {
    kind: kinds.Application,
    content: 'Records read time to sync notification status across devices.',
    tags: [buildDTag(ApplicationDataKey.NOTIFICATIONS_SEEN_AT)],
    created_at: dayjs().unix()
  }
}

export function createBookmarkDraftEvent(tags: string[][], content = ''): TDraftEvent {
  return {
    kind: kinds.BookmarkList,
    content,
    tags,
    created_at: dayjs().unix()
  }
}

export function createPinListDraftEvent(tags: string[][], content = ''): TDraftEvent {
  return {
    kind: kinds.Pinlist,
    content,
    tags,
    created_at: dayjs().unix()
  }
}

export function createBlossomServerListDraftEvent(servers: string[]): TDraftEvent {
  return {
    kind: ExtendedKind.BLOSSOM_SERVER_LIST,
    content: '',
    tags: servers.map((server) => buildServerTag(server)),
    created_at: dayjs().unix()
  }
}

export async function createPollDraftEvent(
  author: string,
  question: string,
  mentions: string[],
  { isMultipleChoice, relays, options, endsAt }: TPollCreateData,
  {
    addClientTag,
    isNsfw
  }: {
    addClientTag?: boolean
    isNsfw?: boolean
  } = {}
): Promise<TDraftEvent> {
  const { content: transformedEmojisContent, emojiTags } = transformCustomEmojisInContent(question)
  const { quoteEventHexIds, quoteReplaceableCoordinates } =
    await extractRelatedEventIds(transformedEmojisContent)
  const tTagValues = extractTTagValues(transformedEmojisContent)

  const tags = emojiTags.concat(tTagValues.map((value) => buildTTag(value)))

  // imeta tags
  const images = extractImagesFromContent(transformedEmojisContent)
  if (images && images.length) {
    tags.push(...generateImetaTags(images))
  }

  // q tags
  tags.push(...quoteEventHexIds.map((eventId) => buildQTag(eventId)))
  tags.push(...quoteReplaceableCoordinates.map((coordinate) => buildReplaceableQTag(coordinate)))

  // p tags
  tags.push(...mentions.map((pubkey) => buildPTag(pubkey)))

  const validOptions = normalizePollOptions(options)
    .map((option) => ({
      id: option.id || randomString(9),
      label: option.label.trim(),
      image: option.image?.trim()
    }))
    .filter((option) => !!option.label)

  tags.push(...validOptions.map((option) => ['option', option.id, option.label]))
  tags.push(
    ...validOptions
      .filter((option) => !!option.image)
      .map((option) => ['option_image', option.id, option.image!])
  )
  tags.push(['polltype', isMultipleChoice ? POLL_TYPE.MULTIPLE_CHOICE : POLL_TYPE.SINGLE_CHOICE])

  if (endsAt) {
    tags.push(['endsAt', endsAt.toString()])
  }

  if (relays.length) {
    relays.forEach((relay) => tags.push(buildRelayTag(relay)))
  } else {
    const relayList = await client.fetchRelayList(author)
    relayList.read.slice(0, 4).forEach((relay) => {
      tags.push(buildRelayTag(relay))
    })
  }

  if (addClientTag) {
    tags.push(buildClientTag())
  }

  if (isNsfw) {
    tags.push(buildNsfwTag())
  }

  const baseDraft = {
    content: transformedEmojisContent.trim(),
    kind: ExtendedKind.POLL,
    tags
  }
  return setDraftEventCache(baseDraft)
}

export function createPollResponseDraftEvent(
  pollEvent: Event,
  selectedOptionIds: string[]
): TDraftEvent {
  return {
    content: '',
    kind: ExtendedKind.POLL_RESPONSE,
    tags: [
      buildETag(pollEvent.id, pollEvent.pubkey),
      buildPTag(pollEvent.pubkey),
      ...selectedOptionIds.map((optionId) => buildResponseTag(optionId))
    ],
    created_at: dayjs().unix()
  }
}

export function createDeletionRequestDraftEvent(event: Event): TDraftEvent {
  const tags: string[][] = [buildKTag(event.kind)]
  if (isReplaceableEvent(event.kind)) {
    tags.push(['a', getReplaceableCoordinateFromEvent(event)])
  } else {
    tags.push(['e', event.id])
  }

  return {
    kind: kinds.EventDeletion,
    content: 'Request for deletion of the event.',
    tags,
    created_at: dayjs().unix()
  }
}

// https://github.com/nostr-protocol/nips/blob/master/56.md
export function createReportDraftEvent(
  event: Event,
  reason: TNip56ReportType,
  details: string = ''
): TDraftEvent {
  const tags: string[][] = []
  if (event.kind === kinds.Metadata) {
    tags.push(['p', event.pubkey, reason])
  } else {
    tags.push(['p', event.pubkey, reason])
    tags.push(['e', event.id, reason])
    if (isReplaceableEvent(event.kind)) {
      tags.push(['a', getReplaceableCoordinateFromEvent(event), reason])
    }
  }

  return {
    kind: kinds.Report,
    content: details.trim(),
    tags,
    created_at: dayjs().unix()
  }
}

export function createRelayReviewDraftEvent(
  relay: string,
  review: string,
  stars: number
): TDraftEvent {
  return {
    kind: ExtendedKind.RELAY_REVIEW,
    content: review,
    tags: [
      ['d', relay],
      ['rating', (stars / 5).toString()]
    ],
    created_at: dayjs().unix()
  }
}

function generateImetaTags(imageUrls: string[]) {
  return imageUrls
    .map((imageUrl) => {
      const tag = mediaUpload.getImetaTagByUrl(imageUrl)
      return tag ?? null
    })
    .filter(Boolean) as string[][]
}

/**
 * Create a kind 1063 (file metadata) draft event for a gallery image
 */
export function createGalleryImageDraftEvent(params: {
  url: string
  description?: string
  link?: string
  mimeType?: string
  hash?: string
  size?: number
  dimensions?: string
  alt?: string
  blurhash?: string
  thumb?: string
}): TDraftEvent {
  const tags: string[][] = [
    ['url', params.url],
    ['t', 'gallery'], // Tag to identify this as a gallery image
    ['t', 'profile-gallery'] // Additional tag for filtering
  ]

  if (params.mimeType) {
    tags.push(['m', params.mimeType])
  }

  if (params.hash) {
    tags.push(['x', params.hash])
  }

  if (params.size !== undefined) {
    tags.push(['size', params.size.toString()])
  }

  if (params.dimensions) {
    tags.push(['dim', params.dimensions])
  }

  if (params.alt) {
    tags.push(['alt', params.alt])
  }

  if (params.blurhash) {
    tags.push(['blurhash', params.blurhash])
  }

  if (params.thumb) {
    tags.push(['thumb', params.thumb])
  }

  if (params.link) {
    tags.push(['r', params.link])
  }

  return setDraftEventCache({
    kind: ExtendedKind.FILE_METADATA,
    content: params.description || '',
    tags
  })
}

/**
 * Create a kind 30001 (bookmark set) draft event for a gallery list
 */
export function createGalleryListDraftEvent(params: {
  imageEventIds: string[]
  dTag?: string
  title?: string
  previousEvent?: Event
}): TDraftEvent {
  const dTag = params.dTag || 'gallery'
  const tags: string[][] = [['d', dTag]]

  if (params.title) {
    tags.push(['title', params.title])
  }

  // Add image event IDs
  for (const eventId of params.imageEventIds) {
    tags.push(['e', eventId])
  }

  // Preserve other tags from previous event if it exists
  if (params.previousEvent) {
    const preservedTags = params.previousEvent.tags.filter(
      tag =>
        !tagNameEquals('d')(tag) &&
        !tagNameEquals('title')(tag) &&
        !tagNameEquals('e')(tag)
    )
    tags.push(...preservedTags)
  }

  return setDraftEventCache({
    kind: ExtendedKind.BOOKMARK_SET,
    content: '',
    tags
  })
}
