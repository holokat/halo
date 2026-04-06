import { nip19 } from 'nostr-tools'

const NSEC_CANDIDATE_REGEX = /(?:nostr:)?nsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}/gi
const NSEC_PREFIX = 'nsec1'
const MIN_PARTIAL_NSEC_REMOVAL = 10
const FULL_NSEC_LENGTH = nip19.nsecEncode(new Uint8Array(32)).length
const MAX_TRUNCATED_NSEC_LENGTH = FULL_NSEC_LENGTH - MIN_PARTIAL_NSEC_REMOVAL

export function extractPrivateKeyCandidates(content: string) {
  const matches = content.match(NSEC_CANDIDATE_REGEX) ?? []
  const validNsecs = new Set<string>()

  matches.forEach((match) => {
    const normalized = match.toLowerCase().replace(/^nostr:/, '')

    if (normalized.startsWith(NSEC_PREFIX) && normalized.length > MAX_TRUNCATED_NSEC_LENGTH) {
      validNsecs.add(normalized)
      return
    }

    try {
      const decoded = nip19.decode(normalized)
      if (decoded.type === 'nsec') {
        validNsecs.add(normalized)
      }
    } catch {
      // Ignore invalid bech32 strings that only look like nsec tokens.
    }
  })

  return Array.from(validNsecs)
}

export function hasPrivateKeyInDraft(content: string, tags: string[][]) {
  const serializedTags = tags.flat().join('\n')
  return extractPrivateKeyCandidates(`${content}\n${serializedTags}`).length > 0
}
