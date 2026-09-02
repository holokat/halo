import { isValidPubkey, pubkeyToNpub } from '@/lib/pubkey'
import { nip19 } from 'nostr-tools'

export function buildInviteUrl(pubkey: string, origin: string): string | null {
  const npub = pubkeyToNpub(pubkey)
  if (!npub) return null

  try {
    const url = new URL('/', origin)
    url.searchParams.set('invite', npub)
    return url.toString()
  } catch {
    return null
  }
}

export function decodeInviteNpub(invite: string | null): string | null {
  if (!invite) return null

  try {
    const decoded = nip19.decode(invite)
    return decoded.type === 'npub' && isValidPubkey(decoded.data) ? decoded.data : null
  } catch {
    return null
  }
}

export function removeInviteParam(url: URL): string {
  const cleanUrl = new URL(url)
  cleanUrl.searchParams.delete('invite')
  return `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`
}
