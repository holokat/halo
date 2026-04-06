import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterExpiredEvents,
  getEventExpirationTimestamp,
  isEventExpired
} from './event-expiration'

test('getEventExpirationTimestamp returns undefined when no expiration tag exists', () => {
  assert.equal(getEventExpirationTimestamp({ tags: [['t', 'nostr']] }), undefined)
})

test('getEventExpirationTimestamp ignores invalid expiration tags', () => {
  assert.equal(getEventExpirationTimestamp({ tags: [['expiration', 'not-a-timestamp']] }), undefined)
  assert.equal(getEventExpirationTimestamp({ tags: [['expiration', '0']] }), undefined)
})

test('isEventExpired honors the expiration tag boundary', () => {
  const event = { tags: [['expiration', '1710000000']] }

  assert.equal(isEventExpired(event, 1709999999), false)
  assert.equal(isEventExpired(event, 1710000000), true)
  assert.equal(isEventExpired(event, 1710000001), true)
})

test('filterExpiredEvents removes only expired events', () => {
  const activeEvent = { tags: [['expiration', '1710000100']] }
  const expiredEvent = { tags: [['expiration', '1710000000']] }
  const timelessEvent = { tags: [['t', 'nostr']] }

  assert.deepEqual(filterExpiredEvents([activeEvent, expiredEvent, timelessEvent], 1710000001), [
    activeEvent,
    timelessEvent
  ])
})
