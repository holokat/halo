import customEmojiService from '@/services/custom-emoji.service'
import { buildEmojiTag } from './draft-event.tags'

export function transformCustomEmojisInContent(content: string) {
  const emojiTags: string[][] = []
  let processedContent = content
  const matches = content.match(/:[a-zA-Z0-9]+:/g)

  const emojiIdSet = new Set<string>()
  matches?.forEach((match) => {
    if (emojiIdSet.has(match)) return
    emojiIdSet.add(match)

    const emoji = customEmojiService.getEmojiById(match.slice(1, -1))
    if (emoji) {
      emojiTags.push(buildEmojiTag(emoji))
      processedContent = processedContent.replace(new RegExp(match, 'g'), `:${emoji.shortcode}:`)
    }
  })

  return {
    emojiTags,
    content: processedContent
  }
}
