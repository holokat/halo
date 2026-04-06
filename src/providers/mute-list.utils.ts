export function parseTagMatrix(text: string): string[][] | null {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) {
      return null
    }
    if (!parsed.every((tag) => tag.every((value) => typeof value === 'string'))) {
      return null
    }
    return parsed as string[][]
  } catch {
    return null
  }
}

export function getEncryptionVersion(cipherText: string): 'nip04' | 'nip44' {
  return cipherText.includes('?iv=') ? 'nip04' : 'nip44'
}

export function normalizeMutedWord(word: string) {
  return word.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeMutedTag(tag: string) {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

export function hasTag(tags: string[][], tagName: string, tagValue: string) {
  return tags.some(([name, value]) => name === tagName && value === tagValue)
}

export function removeTag(tags: string[][], tagName: string, tagValue: string) {
  return tags.filter(([name, value]) => !(name === tagName && value === tagValue))
}

export function hasTagIgnoreCase(tags: string[][], tagName: string, tagValue: string) {
  const normalized =
    tagName === 't' ? normalizeMutedTag(tagValue) : normalizeMutedWord(tagValue)
  return tags.some(([name, value = '']) => {
    if (name !== tagName) return false
    const normalizedValue =
      tagName === 't' ? normalizeMutedTag(value) : normalizeMutedWord(value)
    return normalizedValue === normalized
  })
}

export function removeTagIgnoreCase(tags: string[][], tagName: string, tagValue: string) {
  const normalized =
    tagName === 't' ? normalizeMutedTag(tagValue) : normalizeMutedWord(tagValue)
  return tags.filter(([name, value = '']) => {
    if (name !== tagName) return true
    const normalizedValue =
      tagName === 't' ? normalizeMutedTag(value) : normalizeMutedWord(value)
    return normalizedValue !== normalized
  })
}
