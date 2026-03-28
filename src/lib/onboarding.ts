export function formatHandleValue(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, '')
    .toLowerCase()
}
