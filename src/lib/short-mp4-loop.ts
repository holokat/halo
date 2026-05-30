export const SHORT_MP4_LOOP_MAX_SECONDS = 4

export function isShortMp4LoopCandidateUrl(src: string): boolean {
  try {
    const url = new URL(src, 'https://halo.local')
    return url.pathname.trim().toLowerCase().endsWith('.mp4')
  } catch {
    return false
  }
}

export function shouldLoopShortMp4Duration(durationSeconds: number): boolean {
  return (
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds <= SHORT_MP4_LOOP_MAX_SECONDS
  )
}
