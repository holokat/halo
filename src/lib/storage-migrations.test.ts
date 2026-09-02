import assert from 'node:assert/strict'
import test from 'node:test'
import { StorageKey } from '@/constants'
import {
  LEGACY_NEWS_RELAYS_STORAGE_KEY,
  migrateLegacyNewsFeedBackupStorage
} from './storage-migrations'

test('legacy News relay backups migrate to the feed storage key', () => {
  const legacyRelays = JSON.stringify(['wss://news.example.com/'])
  const original = { [LEGACY_NEWS_RELAYS_STORAGE_KEY]: legacyRelays }

  const migrated = migrateLegacyNewsFeedBackupStorage(original)

  assert.equal(migrated[StorageKey.NEWS_FEED_RELAYS], legacyRelays)
  assert.equal(migrated[LEGACY_NEWS_RELAYS_STORAGE_KEY], undefined)
  assert.equal(original[LEGACY_NEWS_RELAYS_STORAGE_KEY], legacyRelays)
})

test('current News relay backups take precedence over legacy values', () => {
  const currentRelays = JSON.stringify(['wss://current.example.com/'])
  const migrated = migrateLegacyNewsFeedBackupStorage({
    [LEGACY_NEWS_RELAYS_STORAGE_KEY]: JSON.stringify(['wss://legacy.example.com/']),
    [StorageKey.NEWS_FEED_RELAYS]: currentRelays
  })

  assert.equal(migrated[StorageKey.NEWS_FEED_RELAYS], currentRelays)
  assert.equal(migrated[LEGACY_NEWS_RELAYS_STORAGE_KEY], undefined)
})
