import { TProfile } from '@/types'
import { Invoice } from '@getalby/lightning-tools'
import { isEmail } from './utils'

const LIGHTNING_PREFIX = 'lightning:'

export function normalizeLightningAddress(value?: string | null) {
  if (typeof value !== 'string') return ''

  let normalized = value.trim()
  if (normalized.toLowerCase().startsWith(LIGHTNING_PREFIX)) {
    normalized = normalized.slice(LIGHTNING_PREFIX.length).trim()
  }

  return normalized
}

export function isLnurl(value?: string | null) {
  const normalized = normalizeLightningAddress(value)
  return /^lnurl[0-9a-z]+$/i.test(normalized)
}

export function getAmountFromInvoice(invoice: string): number {
  const _invoice = new Invoice({ pr: invoice }) // TODO: need to validate
  return _invoice.satoshi
}

export function formatAmount(amount: number) {
  if (amount < 1000) return amount
  if (amount < 1000000) return `${Math.round(amount / 100) / 10}k`
  return `${Math.round(amount / 100000) / 10}M`
}

export function getLightningAddressCandidatesFromProfile(profile: TProfile) {
  // Some clients have incorrectly filled in the positions for lud06 and lud16
  const { lightningAddress, lud16: a, lud06: b } = profile
  const normalizedLightningAddress = normalizeLightningAddress(lightningAddress)
  const normalizedLud16 = normalizeLightningAddress(a)
  const normalizedLud06 = normalizeLightningAddress(b)
  const candidates: string[] = []

  const addCandidate = (value?: string) => {
    if (!value || candidates.includes(value)) return
    candidates.push(value)
  }

  if (isEmail(normalizedLightningAddress) || isLnurl(normalizedLightningAddress)) {
    addCandidate(normalizedLightningAddress)
  }

  if (normalizedLud16 && isEmail(normalizedLud16)) {
    addCandidate(normalizedLud16)
  }
  if (normalizedLud06 && isEmail(normalizedLud06)) {
    addCandidate(normalizedLud06)
  }

  if (normalizedLud06 && isLnurl(normalizedLud06)) {
    addCandidate(normalizedLud06)
  }
  if (normalizedLud16 && isLnurl(normalizedLud16)) {
    addCandidate(normalizedLud16)
  }

  return candidates
}

export function getLightningAddressFromProfile(profile: TProfile) {
  return getLightningAddressCandidatesFromProfile(profile)[0]
}
