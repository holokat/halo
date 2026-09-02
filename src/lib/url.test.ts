import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRelayConnectionUrl } from './url'

test('upgrades remote relay connections on HTTPS pages', () => {
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', 'https:'), 'wss://nos.lol/')
  assert.equal(normalizeRelayConnectionUrl('http://nostr.mom', 'https:'), 'wss://nostr.mom/')
  assert.equal(
    normalizeRelayConnectionUrl('ws://192.168.1.20:4869', 'https:'),
    'wss://192.168.1.20:4869/'
  )
})

test('preserves secure relay connections and upgrades loopback relays on HTTPS pages', () => {
  assert.equal(
    normalizeRelayConnectionUrl('wss://relay.damus.io', 'https:'),
    'wss://relay.damus.io/'
  )
  assert.equal(normalizeRelayConnectionUrl('ws://localhost:4869', 'https:'), 'wss://localhost:4869/')
  assert.equal(
    normalizeRelayConnectionUrl('ws://127.0.0.1:4869', 'https:'),
    'wss://127.0.0.1:4869/'
  )
  assert.equal(normalizeRelayConnectionUrl('ws://[::1]:4869', 'https:'), 'wss://[::1]:4869/')
})

test('preserves insecure WebSocket relays outside HTTPS pages', () => {
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', 'http:'), 'ws://nos.lol/')
  assert.equal(
    normalizeRelayConnectionUrl('ws://localhost:4869', 'http:'),
    'ws://localhost:4869/'
  )
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', undefined), 'ws://nos.lol/')
})

test('rejects invalid relay URLs', () => {
  assert.equal(normalizeRelayConnectionUrl('not a relay', 'https:'), '')
})
