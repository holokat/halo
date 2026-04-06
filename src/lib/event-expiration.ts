type TTaggedEvent = {
  tags: string[][]
}

export function getEventExpirationTimestamp(event: TTaggedEvent): number | undefined {
  const rawExpiration = event.tags.find(([tagName]) => tagName === 'expiration')?.[1]?.trim()
  if (!rawExpiration) return undefined

  const expirationTimestamp = Number(rawExpiration)
  if (!Number.isInteger(expirationTimestamp) || expirationTimestamp <= 0) {
    return undefined
  }

  return expirationTimestamp
}

export function isEventExpired(
  event: TTaggedEvent,
  now = Math.floor(Date.now() / 1000)
): boolean {
  const expirationTimestamp = getEventExpirationTimestamp(event)
  return expirationTimestamp !== undefined && expirationTimestamp <= now
}

export function filterExpiredEvents<T extends TTaggedEvent>(
  events: T[],
  now = Math.floor(Date.now() / 1000)
): T[] {
  return events.filter((event) => !isEventExpired(event, now))
}
