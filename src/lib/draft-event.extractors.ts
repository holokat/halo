import { STOCK_SYMBOL_REGEX } from '@/constants'

function extractHashtags(content: string) {
  const hashtags: string[] = []
  const matches = content.match(/#[\p{L}\p{N}\p{M}]+/gu)
  matches?.forEach((match) => {
    const hashtag = match.slice(1).toLowerCase()
    if (hashtag) {
      hashtags.push(hashtag)
    }
  })
  return hashtags
}

function extractStockSymbols(content: string) {
  const stockSymbols: string[] = []
  const matches = content.matchAll(new RegExp(STOCK_SYMBOL_REGEX.source, STOCK_SYMBOL_REGEX.flags))

  for (const match of matches) {
    const symbol = match[0]
    const matchStart = match.index ?? 0
    const matchEnd = matchStart + symbol.length
    const prevChar = matchStart > 0 ? content[matchStart - 1] : ''
    const nextChar = matchEnd < content.length ? content[matchEnd] : ''

    if (
      (prevChar && /[\p{L}\p{N}_$]/u.test(prevChar)) ||
      (nextChar && /[A-Z0-9.-]/.test(nextChar))
    ) {
      continue
    }

    const normalizedSymbol = symbol.slice(1).replace(/\.+$/, '').toLowerCase()
    if (normalizedSymbol) {
      stockSymbols.push(normalizedSymbol)
    }
  }

  return stockSymbols
}

export function extractTTagValues(content: string) {
  return Array.from(new Set([...extractHashtags(content), ...extractStockSymbols(content)]))
}

export function extractImagesFromContent(content: string) {
  return content.match(
    /https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp|heic|mp4|webm|ogg|mov|m4v|mp3|wav|flac|aac|m4a|opus|wma)/gi
  )
}
