import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTrustFilterDefaults } from './trust-filter-defaults.ts'

test('new installs enable the notification trust filter only', () => {
  assert.deepEqual(resolveTrustFilterDefaults({}), {
    interactions: false,
    notifications: true,
    notes: false
  })
})

test('saved trust filter choices take precedence over new defaults', () => {
  assert.deepEqual(
    resolveTrustFilterDefaults({
      interactions: true,
      notifications: false,
      notes: true
    }),
    {
      interactions: true,
      notifications: false,
      notes: true
    }
  )
})

test('legacy trust filter choices remain intact during migration', () => {
  assert.deepEqual(resolveTrustFilterDefaults({ legacy: false }), {
    interactions: false,
    notifications: false,
    notes: false
  })
  assert.deepEqual(resolveTrustFilterDefaults({ legacy: true }), {
    interactions: true,
    notifications: true,
    notes: true
  })
})
