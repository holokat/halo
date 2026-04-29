import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SHORT_MP4_LOOP_MAX_SECONDS,
  isShortMp4LoopCandidateUrl,
  shouldLoopShortMp4Duration
} from './short-mp4-loop'

test('short MP4 loop candidates are MP4 URLs only', () => {
  assert.equal(isShortMp4LoopCandidateUrl('https://example.com/media/clip.MP4?download=1'), true)
  assert.equal(isShortMp4LoopCandidateUrl('/uploads/clip.mp4'), true)
  assert.equal(isShortMp4LoopCandidateUrl('https://example.com/media/clip.mov'), false)
  assert.equal(isShortMp4LoopCandidateUrl('not a url'), false)
})

test('short MP4 loop duration policy matches GIF-like clips', () => {
  assert.equal(shouldLoopShortMp4Duration(0), false)
  assert.equal(SHORT_MP4_LOOP_MAX_SECONDS, 4)
  assert.equal(shouldLoopShortMp4Duration(4), true)
  assert.equal(shouldLoopShortMp4Duration(4.01), false)
  assert.equal(shouldLoopShortMp4Duration(SHORT_MP4_LOOP_MAX_SECONDS), true)
  assert.equal(shouldLoopShortMp4Duration(SHORT_MP4_LOOP_MAX_SECONDS + 0.1), false)
  assert.equal(shouldLoopShortMp4Duration(Infinity), false)
})
