import { StorageKey } from '@/constants'
import {
  createCommentDraftEvent,
  createPollDraftEvent,
  createShortTextNoteDraftEvent
} from '@/lib/draft-event'
import { normalizePollCreateData } from '@/lib/poll'
import { randomString } from '@/lib/random'
import { getStorageJson, setStorageJson } from '@/services/local-storage/persistence'
import { TDraftEvent, TPublishOptions, TPollCreateData, TSignerType } from '@/types'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
import { ImageAttachment } from './post-editor-cache.service'

const SCHEDULED_POSTS_CHANGED_EVENT = 'scheduled-posts:changed'

type TScheduledPostExpirationUnit = 'day' | 'week' | 'month' | 'year' | 'never'

export type TScheduledPostExpirationSetting = {
  value: number
  unit: TScheduledPostExpirationUnit
}

export type TScheduledPostPayload = {
  text: string
  images: ImageAttachment[]
  mentions: string[]
  parentEvent?: Event
  isProtectedEvent: boolean
  additionalRelayUrls: string[]
  isPoll: boolean
  pollCreateData: TPollCreateData
  addClientTag: boolean
  isNsfw: boolean
  defaultExpiration: TScheduledPostExpirationSetting
  minPow: number
}

export type TScheduledPost = {
  id: string
  accountPubkey: string
  accountSignerType: TSignerType
  scheduledFor: number
  createdAt: number
  attempts: number
  lastAttemptAt?: number
  lastError?: string
  payload: TScheduledPostPayload
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sortScheduledPosts(posts: TScheduledPost[]) {
  return posts.sort((a, b) => {
    if (a.scheduledFor !== b.scheduledFor) {
      return a.scheduledFor - b.scheduledFor
    }

    return a.createdAt - b.createdAt
  })
}

function getExpirationTimestamp(expiration: TScheduledPostExpirationSetting): number | null {
  if (expiration.unit === 'never') {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  switch (expiration.unit) {
    case 'day':
      return now + expiration.value * 24 * 60 * 60
    case 'week':
      return now + expiration.value * 7 * 24 * 60 * 60
    case 'month':
      return now + expiration.value * 30 * 24 * 60 * 60
    case 'year':
      return now + expiration.value * 365 * 24 * 60 * 60
    default:
      return null
  }
}

function normalizeScheduledPost(post: Partial<TScheduledPost>): TScheduledPost | null {
  if (!post.accountPubkey || typeof post.accountPubkey !== 'string') {
    return null
  }

  if (typeof post.scheduledFor !== 'number' || !Number.isFinite(post.scheduledFor)) {
    return null
  }

  const payload = post.payload
  if (!payload) {
    return null
  }

  return {
    id: typeof post.id === 'string' && post.id ? post.id : randomString(12),
    accountPubkey: post.accountPubkey,
    accountSignerType: post.accountSignerType ?? 'nsec',
    scheduledFor: Math.floor(post.scheduledFor),
    createdAt:
      typeof post.createdAt === 'number' && Number.isFinite(post.createdAt)
        ? Math.floor(post.createdAt)
        : dayjs().unix(),
    attempts:
      typeof post.attempts === 'number' && Number.isFinite(post.attempts) && post.attempts >= 0
        ? Math.floor(post.attempts)
        : 0,
    lastAttemptAt:
      typeof post.lastAttemptAt === 'number' && Number.isFinite(post.lastAttemptAt)
        ? Math.floor(post.lastAttemptAt)
        : undefined,
    lastError: typeof post.lastError === 'string' ? post.lastError : undefined,
    payload: {
      text: typeof payload.text === 'string' ? payload.text : '',
      images: Array.isArray(payload.images)
        ? payload.images
            .filter(
              (image): image is ImageAttachment =>
                !!image &&
                typeof image.url === 'string' &&
                !!image.url.trim()
            )
            .map((image) => ({
              url: image.url.trim(),
              alt: typeof image.alt === 'string' ? image.alt : undefined
            }))
        : [],
      mentions: Array.isArray(payload.mentions)
        ? Array.from(
            new Set(
              payload.mentions.filter(
                (mention): mention is string => typeof mention === 'string' && !!mention.trim()
              )
            )
          )
        : [],
      parentEvent: payload.parentEvent as Event | undefined,
      isProtectedEvent: !!payload.isProtectedEvent,
      additionalRelayUrls: Array.isArray(payload.additionalRelayUrls)
        ? Array.from(
            new Set(
              payload.additionalRelayUrls.filter(
                (relay): relay is string => typeof relay === 'string' && !!relay.trim()
              )
            )
          )
        : [],
      isPoll: !!payload.isPoll,
      pollCreateData: normalizePollCreateData(payload.pollCreateData),
      addClientTag: !!payload.addClientTag,
      isNsfw: !!payload.isNsfw,
      defaultExpiration:
        payload.defaultExpiration &&
        typeof payload.defaultExpiration.value === 'number' &&
        ['day', 'week', 'month', 'year', 'never'].includes(payload.defaultExpiration.unit)
          ? {
              value: payload.defaultExpiration.value,
              unit: payload.defaultExpiration.unit as TScheduledPostExpirationUnit
            }
          : { value: 1, unit: 'year' },
      minPow:
        typeof payload.minPow === 'number' && Number.isFinite(payload.minPow) ? payload.minPow : 0
    }
  }
}

function getRetryDelaySeconds(attempts: number) {
  if (attempts <= 1) return 60
  if (attempts === 2) return 5 * 60
  if (attempts === 3) return 15 * 60
  return 30 * 60
}

class ScheduledPostsService {
  static instance: ScheduledPostsService

  private scheduledPosts: TScheduledPost[] | null = null

  constructor() {
    if (!ScheduledPostsService.instance) {
      ScheduledPostsService.instance = this
    }

    return ScheduledPostsService.instance
  }

  private emitChange() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(SCHEDULED_POSTS_CHANGED_EVENT))
  }

  private ensureLoaded() {
    if (this.scheduledPosts) {
      return
    }

    this.scheduledPosts = sortScheduledPosts(
      getStorageJson<Partial<TScheduledPost>[]>(StorageKey.SCHEDULED_POSTS, [])
        .map(normalizeScheduledPost)
        .filter((post): post is TScheduledPost => post !== null)
    )
  }

  private persist() {
    if (!this.scheduledPosts) {
      return
    }

    setStorageJson(StorageKey.SCHEDULED_POSTS, this.scheduledPosts)
    this.emitChange()
  }

  getScheduledPosts() {
    this.ensureLoaded()
    return cloneValue(this.scheduledPosts ?? [])
  }

  addScheduledPost(
    accountPubkey: string,
    accountSignerType: TSignerType,
    payload: TScheduledPostPayload,
    scheduledFor: number
  ) {
    this.ensureLoaded()

    const scheduledPost = normalizeScheduledPost({
      id: randomString(12),
      accountPubkey,
      accountSignerType,
      scheduledFor,
      createdAt: dayjs().unix(),
      attempts: 0,
      payload: cloneValue(payload)
    })

    if (!scheduledPost) {
      throw new Error('Invalid scheduled post')
    }

    this.scheduledPosts = sortScheduledPosts([...(this.scheduledPosts ?? []), scheduledPost])
    this.persist()

    return cloneValue(scheduledPost)
  }

  removeScheduledPost(id: string) {
    this.ensureLoaded()
    this.scheduledPosts = (this.scheduledPosts ?? []).filter((post) => post.id !== id)
    this.persist()
  }

  removeScheduledPostsForAccount(pubkey: string) {
    this.ensureLoaded()
    const nextPosts = (this.scheduledPosts ?? []).filter((post) => post.accountPubkey !== pubkey)
    if (nextPosts.length === (this.scheduledPosts ?? []).length) {
      return
    }

    this.scheduledPosts = nextPosts
    this.persist()
  }

  markAttemptFailed(id: string, error: unknown) {
    this.ensureLoaded()
    const now = dayjs().unix()
    const message = error instanceof Error ? error.message : String(error)

    this.scheduledPosts = (this.scheduledPosts ?? []).map((post) => {
      if (post.id !== id) return post

      return {
        ...post,
        attempts: post.attempts + 1,
        lastAttemptAt: now,
        lastError: message
      }
    })

    this.persist()
  }

  getReadyScheduledPosts(accountPubkey: string, now = dayjs().unix()) {
    this.ensureLoaded()

    return cloneValue(
      (this.scheduledPosts ?? []).filter((post) => {
        if (post.accountPubkey !== accountPubkey) return false
        if (post.scheduledFor > now) return false
        if (!post.lastAttemptAt) return true

        return post.lastAttemptAt + getRetryDelaySeconds(post.attempts) <= now
      })
    )
  }

  async createDraftEventFromScheduledPost(scheduledPost: TScheduledPost): Promise<{
    draftEvent: TDraftEvent
    publishOptions: TPublishOptions
  }> {
    const { payload } = scheduledPost
    let contentWithImages = payload.text.trim()

    if (payload.images.length > 0) {
      const imageUrls = payload.images.map((image) => image.url).join('\n')
      contentWithImages = contentWithImages ? `${contentWithImages}\n${imageUrls}` : imageUrls
    }

    const mentions = Array.from(new Set(payload.mentions))
    const normalizedPollCreateData = normalizePollCreateData(payload.pollCreateData)

    const draftEvent =
      payload.parentEvent && payload.parentEvent.kind !== kinds.ShortTextNote
        ? await createCommentDraftEvent(contentWithImages, payload.parentEvent, mentions, {
            addClientTag: payload.addClientTag,
            protectedEvent: payload.isProtectedEvent,
            isNsfw: payload.isNsfw
          })
        : payload.isPoll
          ? await createPollDraftEvent(
              scheduledPost.accountPubkey,
              contentWithImages,
              mentions,
              normalizedPollCreateData,
              {
                addClientTag: payload.addClientTag,
                isNsfw: payload.isNsfw
              }
            )
          : await createShortTextNoteDraftEvent(contentWithImages, mentions, {
              parentEvent: payload.parentEvent,
              addClientTag: payload.addClientTag,
              protectedEvent: payload.isProtectedEvent,
              isNsfw: payload.isNsfw
            })

    if (payload.images.length > 0) {
      payload.images.forEach((image) => {
        const imetaTags: string[] = ['imeta', `url ${image.url}`]
        if (image.alt) {
          imetaTags.push(`alt ${image.alt}`)
        }
        draftEvent.tags.push(imetaTags)
      })
    }

    const expirationTimestamp = getExpirationTimestamp(payload.defaultExpiration)
    if (expirationTimestamp !== null) {
      draftEvent.tags.push(['expiration', String(expirationTimestamp)])
    }

    return {
      draftEvent,
      publishOptions: {
        specifiedRelayUrls: payload.isProtectedEvent ? payload.additionalRelayUrls : undefined,
        additionalRelayUrls: payload.isPoll
          ? normalizedPollCreateData.relays
          : payload.additionalRelayUrls,
        minPow: payload.minPow
      }
    }
  }
}

export const scheduledPostsChangedEventName = SCHEDULED_POSTS_CHANGED_EVENT

const instance = new ScheduledPostsService()
export default instance
