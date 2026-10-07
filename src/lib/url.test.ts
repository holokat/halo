import assert from 'node:assert/strict'
import test from 'node:test'
import { isLocalNetworkUrl, normalizeRelayConnectionUrl } from './url'

test('preserves public relays and upgrades insecure connections on HTTPS pages', () => {
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', 'https:'), 'wss://nos.lol/')
  assert.equal(normalizeRelayConnectionUrl('http://nostr.mom', 'https:'), 'wss://nostr.mom/')
  assert.equal(
    normalizeRelayConnectionUrl('wss://relay.damus.io', 'https:'),
    'wss://relay.damus.io/'
  )
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', 'http:'), 'ws://nos.lol/')
  assert.equal(normalizeRelayConnectionUrl('ws://nos.lol', undefined), 'ws://nos.lol/')
  assert.equal(normalizeRelayConnectionUrl('wss://[2606:4700::1111]'), 'wss://[2606:4700::1111]/')
})

test('rejects local relays on every page protocol, including disguised IP addresses', () => {
  const hosts = [
    'localhost',
    'LOCALHOST.',
    'relay.localhost',
    'relay.local',
    'relay',
    '127.0.0.1',
    '127.20.30.40',
    '127.1',
    '2130706433',
    '0x7f000001',
    '0177.0.0.1',
    '0.0.0.0',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.20',
    '169.254.1.2',
    '100.64.0.1',
    '[::]',
    '[::1]',
    '[0:0:0:0:0:0:0:1]',
    '[fc00::1]',
    '[fd12::1]',
    '[fe80::1]',
    '[febf::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:192.168.1.1]'
  ]
  for (const host of hosts) {
    for (const scheme of ['ws', 'wss', 'http', 'https']) {
      for (const pageProtocol of ['http:', 'https:', undefined]) {
        const url = `${scheme}://${host}:4869`
        assert.equal(normalizeRelayConnectionUrl(url, pageProtocol), '', url)
      }
    }
  }
})

test('does not classify public IPv4 boundaries or similar domain names as local', () => {
  for (const host of ['172.15.0.1', '172.32.0.1', '100.128.0.1', 'localhost.example.com']) {
    assert.equal(isLocalNetworkUrl(`wss://${host}`), false, host)
    assert.notEqual(normalizeRelayConnectionUrl(`wss://${host}`), '', host)
  }
})

test('rejects invalid URLs and non-WebSocket relay schemes', () => {
  assert.equal(normalizeRelayConnectionUrl('not a relay', 'https:'), '')
  assert.equal(normalizeRelayConnectionUrl('ftp://relay.example.com'), '')
})
