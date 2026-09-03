import { createContext, useContext } from 'react'

export type TSpamFilterPersonalization = {
  /** A stable value to use as the cache key for personalized NSpam scores. */
  signature: string
  /** A deterministic, inspectable description of the personalization inputs. */
  label: string
}

export type TSpamFilterContext = {
  enabled: boolean
  markedPubkeys: ReadonlySet<string>
  safelistedPubkeys: ReadonlySet<string>
  personalization: TSpamFilterPersonalization
  personalizationSignature: string
  personalizationLabel: string
  markSpam: (pubkey: string) => void
  removeSpamMark: (pubkey: string) => void
  markNotSpam: (pubkey: string) => void
  setEnabled: (enabled: boolean) => void
}

export const SpamFilterContext = createContext<TSpamFilterContext | undefined>(undefined)

export const useSpamFilter = () => {
  const context = useContext(SpamFilterContext)
  if (!context) {
    throw new Error('useSpamFilter must be used within a SpamFilterProvider')
  }
  return context
}
