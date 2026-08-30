export function applyLocalSpamMarkForReport(
  reason: string,
  pubkey: string,
  markSpam: (pubkey: string) => void
) {
  if (reason !== 'spam') return false

  markSpam(pubkey)
  return true
}
