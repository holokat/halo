import { useNostr } from '@/providers/NostrProvider'
import {
  SpamFilterContext,
  type TSpamFilterContext,
  type TSpamFilterPersonalization
} from '@/providers/SpamFilterContext'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export { useSpamFilter } from '@/providers/SpamFilterContext'
export type { TSpamFilterPersonalization } from '@/providers/SpamFilterContext'

export const SPAM_FILTER_STORAGE_NAMESPACE = 'halo.spamFilter.v1'
const ANONYMOUS_SCOPE = 'anonymous'

type TStoredSpamFilterState = {
  enabled: boolean
  markedPubkeys: string[]
  safelistedPubkeys: string[]
}

const EMPTY_STATE: TStoredSpamFilterState = {
  enabled: true,
  markedPubkeys: [],
  safelistedPubkeys: []
}

function normalizePubkey(pubkey: string) {
  return pubkey.trim().toLowerCase()
}

function normalizePubkeys(pubkeys: unknown) {
  if (!Array.isArray(pubkeys)) return []

  return Array.from(
    new Set(
      pubkeys
        .filter((pubkey): pubkey is string => typeof pubkey === 'string')
        .map(normalizePubkey)
        .filter(Boolean)
    )
  ).sort()
}

function normalizeState(value: unknown): TStoredSpamFilterState {
  if (!value || typeof value !== 'object') return EMPTY_STATE

  const candidate = value as Partial<TStoredSpamFilterState>
  const markedPubkeys = normalizePubkeys(candidate.markedPubkeys)
  const markedPubkeySet = new Set(markedPubkeys)
  const safelistedPubkeys = normalizePubkeys(candidate.safelistedPubkeys).filter(
    (pubkey) => !markedPubkeySet.has(pubkey)
  )

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    markedPubkeys,
    safelistedPubkeys
  }
}

function getStorage() {
  if (typeof window === 'undefined') return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function getStorageKey(scope: string) {
  return `${SPAM_FILTER_STORAGE_NAMESPACE}:${scope}`
}

function readState(scope: string): TStoredSpamFilterState {
  try {
    const serialized = getStorage()?.getItem(getStorageKey(scope))
    return serialized ? normalizeState(JSON.parse(serialized)) : EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

function writeState(scope: string, state: TStoredSpamFilterState) {
  try {
    getStorage()?.setItem(getStorageKey(scope), JSON.stringify(state))
  } catch {
    // Private browsing and quota failures should not break reply rendering.
  }
}

function sanitizeStateForScope(state: TStoredSpamFilterState, scope: string) {
  if (scope === ANONYMOUS_SCOPE) return state

  return {
    ...state,
    markedPubkeys: state.markedPubkeys.filter((pubkey) => pubkey !== scope),
    safelistedPubkeys: state.safelistedPubkeys.filter((pubkey) => pubkey !== scope)
  }
}

function buildPersonalization(
  markedPubkeys: readonly string[],
  safelistedPubkeys: readonly string[]
): TSpamFilterPersonalization {
  const marked = markedPubkeys.join(',')
  const safelisted = safelistedPubkeys.join(',')
  const signature = `v1|marked:${marked}|safelisted:${safelisted}`

  return {
    signature,
    label: `NSpam v1, ${markedPubkeys.length} marked, ${safelistedPubkeys.length} safelisted`
  }
}

export function SpamFilterProvider({ children }: { children: ReactNode }) {
  const { pubkey } = useNostr()
  const scope = normalizePubkey(pubkey ?? '') || ANONYMOUS_SCOPE
  const stateByScopeRef = useRef(new Map<string, TStoredSpamFilterState>())
  const [, setRevision] = useState(0)
  let state = stateByScopeRef.current.get(scope)
  if (!state) {
    state = sanitizeStateForScope(readState(scope), scope)
    stateByScopeRef.current.set(scope, state)
  }

  const updateState = useCallback(
    (createNextState: (current: TStoredSpamFilterState) => TStoredSpamFilterState) => {
      const current =
        stateByScopeRef.current.get(scope) ?? sanitizeStateForScope(readState(scope), scope)
      const next = sanitizeStateForScope(normalizeState(createNextState(current)), scope)
      stateByScopeRef.current.set(scope, next)
      writeState(scope, next)
      setRevision((revision) => revision + 1)
    },
    [scope]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorage = (event: StorageEvent) => {
      const storagePrefix = `${SPAM_FILTER_STORAGE_NAMESPACE}:`
      if (!event.key?.startsWith(storagePrefix)) return
      const changedScope = event.key.slice(storagePrefix.length)
      if (!changedScope) return
      stateByScopeRef.current.set(
        changedScope,
        sanitizeStateForScope(readState(changedScope), changedScope)
      )
      if (changedScope === scope) {
        setRevision((revision) => revision + 1)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [scope])

  const markSpam = useCallback(
    (pubkey: string) => {
      const normalizedPubkey = normalizePubkey(pubkey)
      if (!normalizedPubkey || (scope !== ANONYMOUS_SCOPE && normalizedPubkey === scope)) return

      updateState((current) => ({
        ...current,
        markedPubkeys: [...current.markedPubkeys, normalizedPubkey],
        safelistedPubkeys: current.safelistedPubkeys.filter((key) => key !== normalizedPubkey)
      }))
    },
    [scope, updateState]
  )

  const removeSpamMark = useCallback(
    (pubkey: string) => {
      const normalizedPubkey = normalizePubkey(pubkey)
      if (!normalizedPubkey) return

      updateState((current) => ({
        ...current,
        markedPubkeys: current.markedPubkeys.filter((key) => key !== normalizedPubkey)
      }))
    },
    [updateState]
  )

  const markNotSpam = useCallback(
    (pubkey: string) => {
      const normalizedPubkey = normalizePubkey(pubkey)
      if (!normalizedPubkey) return

      updateState((current) => ({
        ...current,
        markedPubkeys: current.markedPubkeys.filter((key) => key !== normalizedPubkey),
        safelistedPubkeys: [...current.safelistedPubkeys, normalizedPubkey]
      }))
    },
    [updateState]
  )

  const setEnabled = useCallback(
    (enabled: boolean) => {
      updateState((current) => ({ ...current, enabled }))
    },
    [updateState]
  )

  const markedPubkeys = useMemo(() => new Set(state.markedPubkeys), [state.markedPubkeys])
  const safelistedPubkeys = useMemo(
    () => new Set(state.safelistedPubkeys),
    [state.safelistedPubkeys]
  )
  const personalization = useMemo(
    () => buildPersonalization(state.markedPubkeys, state.safelistedPubkeys),
    [state.markedPubkeys, state.safelistedPubkeys]
  )

  const value = useMemo<TSpamFilterContext>(
    () => ({
      enabled: state.enabled,
      markedPubkeys,
      safelistedPubkeys,
      personalization,
      personalizationSignature: personalization.signature,
      personalizationLabel: personalization.label,
      markSpam,
      removeSpamMark,
      markNotSpam,
      setEnabled
    }),
    [
      state.enabled,
      markedPubkeys,
      safelistedPubkeys,
      personalization,
      markSpam,
      removeSpamMark,
      markNotSpam,
      setEnabled
    ]
  )

  return <SpamFilterContext.Provider value={value}>{children}</SpamFilterContext.Provider>
}
