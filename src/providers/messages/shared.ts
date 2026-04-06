export const TWO_DAYS_IN_SECONDS = 2 * 24 * 60 * 60

export function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

export function randomWrappedTimestamp() {
  return Math.round(Date.now() / 1000 - Math.random() * TWO_DAYS_IN_SECONDS)
}
