import client from '@/services/client.service'
import { TEmoji, TMailboxRelayScope } from '@/types'
import { Event } from 'nostr-tools'
import { getReplaceableCoordinateFromEvent } from './event'

export function buildATag(event: Event, upperCase: boolean = false) {
  const coordinate = getReplaceableCoordinateFromEvent(event)
  const hint = client.getEventHint(event.id)
  return trimTagEnd([upperCase ? 'A' : 'a', coordinate, hint])
}

export function buildDTag(identifier: string) {
  return ['d', identifier]
}

export function buildETag(
  eventHexId: string,
  pubkey: string = '',
  hint: string = '',
  upperCase: boolean = false
) {
  if (!hint) {
    hint = client.getEventHint(eventHexId)
  }
  return trimTagEnd([upperCase ? 'E' : 'e', eventHexId, hint, pubkey])
}

export function buildETagWithMarker(
  eventHexId: string,
  pubkey: string = '',
  hint: string = '',
  marker: 'root' | 'reply' | '' = ''
) {
  if (!hint) {
    hint = client.getEventHint(eventHexId)
  }
  return trimTagEnd(['e', eventHexId, hint, marker, pubkey])
}

export function buildITag(url: string, upperCase: boolean = false) {
  return [upperCase ? 'I' : 'i', url]
}

export function buildKTag(kind: number | string, upperCase: boolean = false) {
  return [upperCase ? 'K' : 'k', kind.toString()]
}

export function buildPTag(pubkey: string, upperCase: boolean = false) {
  return [upperCase ? 'P' : 'p', pubkey]
}

export function buildQTag(eventHexId: string) {
  return trimTagEnd(['q', eventHexId, client.getEventHint(eventHexId)])
}

export function buildReplaceableQTag(coordinate: string) {
  return trimTagEnd(['q', coordinate])
}

export function buildRTag(url: string, scope: TMailboxRelayScope) {
  return scope !== 'both' ? ['r', url, scope] : ['r', url]
}

export function buildTTag(hashtag: string) {
  return ['t', hashtag]
}

export function buildEmojiTag(emoji: TEmoji) {
  return ['emoji', emoji.shortcode, emoji.url]
}

export function buildTitleTag(title: string) {
  return ['title', title]
}

export function buildRelayTag(url: string) {
  return ['relay', url]
}

export function buildServerTag(url: string) {
  return ['server', url]
}

export function buildResponseTag(value: string) {
  return ['response', value]
}

export function buildClientTag() {
  return ['client', 'x21']
}

export function buildNsfwTag() {
  return ['content-warning', 'NSFW']
}

export function buildProtectedTag() {
  return ['-']
}

export function trimTagEnd(tag: string[]) {
  let endIndex = tag.length - 1
  while (endIndex >= 0 && tag[endIndex] === '') {
    endIndex--
  }

  return tag.slice(0, endIndex + 1)
}
