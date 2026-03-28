import assert from 'node:assert/strict'
import test from 'node:test'
import { BoundedMap } from './bounded-map.ts'

test('BoundedMap evicts the oldest entry when the size limit is exceeded', () => {
  const map = new BoundedMap<string, number>(2)

  map.set('a', 1)
  map.set('b', 2)
  map.set('c', 3)

  assert.deepEqual([...map.entries()], [
    ['b', 2],
    ['c', 3]
  ])
})

test('BoundedMap refreshes recency when a key is read', () => {
  const map = new BoundedMap<string, number>(2)

  map.set('a', 1)
  map.set('b', 2)
  map.get('a')
  map.set('c', 3)

  assert.equal(map.has('a'), true)
  assert.equal(map.has('b'), false)
  assert.deepEqual([...map.keys()], ['a', 'c'])
})
