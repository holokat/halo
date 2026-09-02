import { StorageKey } from '@/constants'

export const LEGACY_NEWS_RELAYS_STORAGE_KEY = 'newsWidgetRelays'

export function migrateLegacyNewsFeedBackupStorage(
  storedValues: Record<string, string>
): Record<string, string> {
  const migratedValues = { ...storedValues }
  const legacyValue = migratedValues[LEGACY_NEWS_RELAYS_STORAGE_KEY]

  if (legacyValue && !migratedValues[StorageKey.NEWS_FEED_RELAYS]) {
    migratedValues[StorageKey.NEWS_FEED_RELAYS] = legacyValue
  }

  delete migratedValues[LEGACY_NEWS_RELAYS_STORAGE_KEY]
  return migratedValues
}
