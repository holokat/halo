import assert from 'node:assert/strict'
import test from 'node:test'
import { extractImagesFromContent, extractTTagValues } from './draft-event.extractors.ts'

test('extractTTagValues dedupes hashtags and standalone cashtags', () => {
  const values = extractTTagValues(
    'Stacking #Bitcoin with #bitcoin and tracking $MSTR while ignoring amount$TSLA and $BTC.'
  )

  assert.deepEqual(values, ['bitcoin', 'mstr', 'btc'])
})

test('extractImagesFromContent returns direct image links only', () => {
  const images = extractImagesFromContent(
    'Image https://cdn.example.com/a.png and https://cdn.example.com/b.webp?size=large but not https://example.com/watch?v=1'
  )

  assert.deepEqual(images, ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.webp'])
})
