import { getStorageJson, getStorageItem } from './persistence'

export function readStoredStringValue(key: string): string | null {
  return getStorageItem(key)
}

export function readStoredString(key: string, fallback: string): string {
  return readStoredStringValue(key) ?? fallback
}

export function readStoredBooleanValue(key: string): boolean | null {
  const value = getStorageItem(key)
  if (value === null) {
    return null
  }
  return value === 'true'
}

export function readStoredBoolean(key: string, fallback = false): boolean {
  return readStoredBooleanValue(key) ?? fallback
}

export function readStoredNumberValue(key: string): number | null {
  const value = getStorageItem(key)
  if (value === null) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function readStoredNumber(
  key: string,
  fallback: number,
  isValid?: (value: number) => boolean
): number {
  const value = readStoredNumberValue(key)
  if (value === null) {
    return fallback
  }

  if (isValid && !isValid(value)) {
    return fallback
  }

  return value
}

export function readStoredEnum<T extends string>(
  key: string,
  allowedValues: readonly T[],
  fallback: T
): T {
  const value = getStorageItem(key)
  if (value && (allowedValues as readonly string[]).includes(value)) {
    return value as T
  }
  return fallback
}

export function readStoredJson<T>(key: string, fallback: T): T {
  return getStorageJson<T>(key, fallback)
}

export function readStoredStringArray(
  key: string,
  fallback: string[] = [],
  normalize: (value: string) => string | null = (value) => value
): string[] {
  const value = getStorageJson<unknown>(key, null)
  if (!Array.isArray(value)) {
    return fallback
  }

  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalize(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0)

  return Array.from(new Set(normalized))
}
