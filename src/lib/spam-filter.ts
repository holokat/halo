export function normalizeSpamFilterPubkey(pubkey: string | null | undefined) {
  return pubkey?.trim().toLowerCase() ?? ''
}

export function isSpamMarkedPubkey(
  pubkey: string | null | undefined,
  markedPubkeys: ReadonlySet<string>
) {
  const normalizedPubkey = normalizeSpamFilterPubkey(pubkey)
  return normalizedPubkey.length > 0 && markedPubkeys.has(normalizedPubkey)
}

export function filterSpamMarkedEvents<T extends { pubkey: string }>(
  events: readonly T[],
  markedPubkeys: ReadonlySet<string>
) {
  return events.filter((event) => !isSpamMarkedPubkey(event.pubkey, markedPubkeys))
}
