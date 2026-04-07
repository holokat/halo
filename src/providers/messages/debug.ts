type TDebugValue =
  | null
  | undefined
  | string
  | number
  | boolean
  | TDebugValue[]
  | { [key: string]: TDebugValue }

const DEBUG_QUERY_KEYS = ['debug-dms', 'dm-debug']
const DEBUG_STORAGE_KEYS = ['x21.debug.dms', 'debug:dms']
const REDACTED_KEYS = ['content', 'cipherText', 'sealContent', 'rumorContent', 'plainText']

function readDebugQueryFlag() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const params = new URLSearchParams(window.location.search)
    for (const key of DEBUG_QUERY_KEYS) {
      const value = params.get(key)
      if (value === '1' || value === 'true') {
        return true
      }
      if (value === '0' || value === 'false') {
        return false
      }
    }
  } catch {
    return null
  }

  return null
}

function readDebugStorageFlag() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    for (const key of DEBUG_STORAGE_KEYS) {
      const value = window.localStorage.getItem(key)?.toLowerCase()
      if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
        return true
      }
    }
  } catch {
    return false
  }

  return false
}

function sanitizeDebugValue(value: unknown, depth = 0): TDebugValue {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (depth >= 3) {
    return '[truncated]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (REDACTED_KEYS.includes(key)) {
          return [key, '[redacted]']
        }

        return [key, sanitizeDebugValue(item, depth + 1)]
      })
    )
  }

  return String(value)
}

export function isDmDebugEnabled() {
  const queryFlag = readDebugQueryFlag()
  if (queryFlag !== null) {
    return queryFlag
  }

  return readDebugStorageFlag()
}

export function debugDm(message: string, details?: unknown) {
  if (!isDmDebugEnabled()) {
    return
  }

  if (details === undefined) {
    console.debug('[DM DEBUG]', message)
    return
  }

  console.debug('[DM DEBUG]', message, sanitizeDebugValue(details))
}

export function warnDm(message: string, details?: unknown) {
  if (!isDmDebugEnabled()) {
    return
  }

  if (details === undefined) {
    console.warn('[DM DEBUG]', message)
    return
  }

  console.warn('[DM DEBUG]', message, sanitizeDebugValue(details))
}
