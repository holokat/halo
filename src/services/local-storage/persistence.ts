export function getStorageItem(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage.getItem(key)
}

export function setStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(key, value)
}

export function removeStorageItem(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.removeItem(key)
}

export function setStorageBoolean(key: string, value: boolean): void {
  setStorageItem(key, value.toString())
}

export function setStorageNumber(key: string, value: number): void {
  setStorageItem(key, value.toString())
}

export function setStorageJson(key: string, value: unknown): void {
  setStorageItem(key, JSON.stringify(value))
}

export function getStorageJson<T>(key: string, fallback: T): T {
  const raw = getStorageItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
