import { getEmojisAndEmojiSetsFromEvent, getEmojisFromEvent } from '@/lib/event-metadata'
import { parseEmojiPickerUnified } from '@/lib/utils'
import client from '@/services/client.service'
import { TEmoji } from '@/types'
import { sha256 } from '@noble/hashes/sha2'
import { SkinTones } from 'emoji-picker-react'
import FlexSearch from 'flexsearch'
import { Event } from 'nostr-tools'

const SUGGESTED_LS_KEY = 'epr_suggested'

type TSuggestedItem = {
  unified: string
  original: string
  count: number
}

type TSuggestedEmoji = {
  u: string
  [key: string]: unknown
}

function getSuggested() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [] as TSuggestedItem[]
    }

    return JSON.parse(window.localStorage.getItem(SUGGESTED_LS_KEY) ?? '[]') as TSuggestedItem[]
  } catch {
    return [] as TSuggestedItem[]
  }
}

function setSuggested(emoji: TSuggestedEmoji, _skinTone: SkinTones) {
  const recent = getSuggested()
  const unified = emoji.u
  let existing = recent.find((item) => item.unified === unified)
  let nextList: TSuggestedItem[]

  if (existing) {
    nextList = [existing].concat(recent.filter((item) => item !== existing))
  } else {
    existing = {
      unified,
      original: unified,
      count: 0
    }
    nextList = [existing, ...recent]
  }

  existing.count += 1
  nextList.length = Math.min(nextList.length, 14)

  try {
    window.localStorage.setItem(SUGGESTED_LS_KEY, JSON.stringify(nextList))
  } catch {
    // ignore
  }
}

class CustomEmojiService {
  static instance: CustomEmojiService

  private emojiMap = new Map<string, TEmoji>()
  private emojiIndex = new FlexSearch.Index({
    tokenize: 'full'
  })

  constructor() {
    if (!CustomEmojiService.instance) {
      CustomEmojiService.instance = this
    }
    return CustomEmojiService.instance
  }

  async init(userEmojiListEvent: Event | null) {
    if (!userEmojiListEvent) return

    const { emojis, emojiSetPointers } = getEmojisAndEmojiSetsFromEvent(userEmojiListEvent)
    await this.addEmojisToIndex(emojis)

    const emojiSetEvents = await client.fetchEmojiSetEvents(emojiSetPointers)
    await Promise.allSettled(
      emojiSetEvents.map(async (event) => {
        if (!event || event instanceof Error) return

        await this.addEmojisToIndex(getEmojisFromEvent(event))
      })
    )
  }

  async searchEmojis(query: string = ''): Promise<string[]> {
    if (!query) {
      const idSet = new Set<string>()
      getSuggested()
        .sort((a, b) => b.count - a.count)
        .map((item) => parseEmojiPickerUnified(item.unified))
        .forEach((item) => {
          if (item && typeof item !== 'string') {
            const id = this.getEmojiId(item)
            if (!idSet.has(id)) {
              idSet.add(id)
            }
          }
        })
      for (const key of this.emojiMap.keys()) {
        idSet.add(key)
      }
      return Array.from(idSet)
    }
    const results = await this.emojiIndex.searchAsync(query)
    return results.filter((id) => typeof id === 'string') as string[]
  }

  getEmojiById(id?: string): TEmoji | undefined {
    if (!id) return undefined

    return this.emojiMap.get(id)
  }

  getAllCustomEmojisForPicker() {
    return Array.from(this.emojiMap.values()).map((emoji) => ({
      id: `:${emoji.shortcode}:${emoji.url}`,
      imgUrl: emoji.url,
      names: [emoji.shortcode]
    }))
  }

  isCustomEmojiId(shortcode: string) {
    return this.emojiMap.has(shortcode)
  }

  private async addEmojisToIndex(emojis: TEmoji[]) {
    await Promise.allSettled(
      emojis.map(async (emoji) => {
        const id = this.getEmojiId(emoji)
        this.emojiMap.set(id, emoji)
        await this.emojiIndex.addAsync(id, emoji.shortcode)
      })
    )
  }

  getEmojiId(emoji: TEmoji) {
    const encoder = new TextEncoder()
    const data = encoder.encode(`${emoji.shortcode}:${emoji.url}`.toLowerCase())
    const hashBuffer = sha256(data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  updateSuggested(id: string) {
    const emoji = this.getEmojiById(id)
    if (!emoji) return

    setSuggested(
      {
        n: [emoji.shortcode.toLowerCase()],
        u: `:${emoji.shortcode}:${emoji.url}`.toLowerCase(),
        a: '0',
        imgUrl: emoji.url
      },
      SkinTones.NEUTRAL
    )
  }
}

const instance = new CustomEmojiService()
export default instance
