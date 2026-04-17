import {
  createCommentDraftEvent,
  createPollDraftEvent,
  createShortTextNoteDraftEvent
} from '@/lib/draft-event'
import postEditorCache, { ImageAttachment } from '@/services/post-editor-cache.service'
import { TScheduledPostPayload } from '@/services/scheduled-posts.service'
import { TDraftEvent, TPollCreateData } from '@/types'
import { Event, kinds } from 'nostr-tools'

type TCreateComposerDraftEventParams = {
  addClientTag: boolean
  images: ImageAttachment[]
  isNsfw: boolean
  isPoll: boolean
  isProtectedEvent: boolean
  mentions: string[]
  parentEvent?: Event
  pollCreateData: TPollCreateData
  pubkey: string
  requiredMentionPubkeys: string[]
  text: string
}

type TScheduledPostDraftParams = {
  addClientTag: boolean
  additionalRelayUrls: string[]
  defaultExpiration: TScheduledPostPayload['defaultExpiration']
  images: ImageAttachment[]
  isNsfw: boolean
  isPoll: boolean
  isProtectedEvent: boolean
  mentions: string[]
  minPow: number
  parentEvent?: Event
  pollCreateData: TPollCreateData
  requiredMentionPubkeys: string[]
  text: string
}

export function buildComposerContent(text: string, images: ImageAttachment[]) {
  const trimmedText = text.trim()
  if (images.length === 0) {
    return trimmedText
  }

  const imageUrls = images.map((image) => image.url).join('\n')
  return trimmedText ? `${trimmedText}\n${imageUrls}` : imageUrls
}

export function buildComposerMentions(mentions: string[], requiredMentionPubkeys: string[]) {
  return Array.from(new Set([...mentions, ...requiredMentionPubkeys]))
}

export async function createComposerDraftEvent({
  addClientTag,
  images,
  isNsfw,
  isPoll,
  isProtectedEvent,
  mentions,
  parentEvent,
  pollCreateData,
  pubkey,
  requiredMentionPubkeys,
  text
}: TCreateComposerDraftEventParams): Promise<TDraftEvent> {
  const contentWithImages = buildComposerContent(text, images)
  const allMentions = buildComposerMentions(mentions, requiredMentionPubkeys)

  if (parentEvent && parentEvent.kind !== kinds.ShortTextNote) {
    return createCommentDraftEvent(contentWithImages, parentEvent, allMentions, {
      addClientTag,
      protectedEvent: isProtectedEvent,
      isNsfw
    })
  }

  if (isPoll) {
    return createPollDraftEvent(pubkey, contentWithImages, allMentions, pollCreateData, {
      addClientTag,
      isNsfw
    })
  }

  return createShortTextNoteDraftEvent(contentWithImages, allMentions, {
    parentEvent,
    addClientTag,
    protectedEvent: isProtectedEvent,
    isNsfw
  })
}

export function appendImageMetadataTags(draftEvent: TDraftEvent, images: ImageAttachment[]) {
  if (images.length === 0) {
    return draftEvent
  }

  images.forEach((image) => {
    draftEvent.tags.push(buildImageAttachmentImetaTag(image))
  })

  return draftEvent
}

export function buildImageAttachmentImetaTag(image: ImageAttachment) {
  const imetaTags = image.imetaTag?.length ? [...image.imetaTag] : ['imeta', `url ${image.url}`]

  if (!imetaTags.some((item) => item.startsWith('url '))) {
    imetaTags.push(`url ${image.url}`)
  }

  if (image.mimeType && !imetaTags.some((item) => item.startsWith('m '))) {
    imetaTags.push(`m ${image.mimeType}`)
  }

  if (image.fileSizeBytes && !imetaTags.some((item) => item.startsWith('size '))) {
    imetaTags.push(`size ${image.fileSizeBytes}`)
  }

  if (image.width && image.height && !imetaTags.some((item) => item.startsWith('dim '))) {
    imetaTags.push(`dim ${Math.round(image.width)}x${Math.round(image.height)}`)
  }

  if (image.alt && !imetaTags.some((item) => item.startsWith('alt '))) {
    imetaTags.push(`alt ${image.alt}`)
  }

  if (image.gifLoop && !imetaTags.some((item) => item.toLowerCase().startsWith('flow-gif-loop '))) {
    imetaTags.push('flow-gif-loop 1')
  }

  return imetaTags
}

export function appendExpirationTag(draftEvent: TDraftEvent, expirationTimestamp: number | null) {
  if (expirationTimestamp !== null) {
    draftEvent.tags.push(['expiration', String(expirationTimestamp)])
  }
  return draftEvent
}

export function buildScheduledPostDraft({
  addClientTag,
  additionalRelayUrls,
  defaultExpiration,
  images,
  isNsfw,
  isPoll,
  isProtectedEvent,
  mentions,
  minPow,
  parentEvent,
  pollCreateData,
  requiredMentionPubkeys,
  text
}: TScheduledPostDraftParams): TScheduledPostPayload {
  return {
    text,
    images,
    mentions: buildComposerMentions(mentions, requiredMentionPubkeys),
    parentEvent,
    isProtectedEvent,
    additionalRelayUrls,
    isPoll,
    pollCreateData,
    addClientTag,
    isNsfw,
    defaultExpiration,
    minPow
  }
}

export function clearComposerDraftCache(defaultContent: string, parentEvent?: Event) {
  postEditorCache.clearPostCache({ defaultContent, parentEvent })
}
