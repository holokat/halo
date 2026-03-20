import { TPollCreateData, TPollOption } from '@/types'
import { randomString } from './random'

type TLegacyPollOption = string | Partial<TPollOption> | null | undefined
type TLegacyZapPollConfig = {
  options: TPollOption[]
  minZapAmount?: number
  maxZapAmount?: number
}

export type TLegacyZapVote = {
  pubkey: string
  amount: number
  pollOptionId?: string
}

export type TLegacyZapPollResults = {
  totalAmount: number
  totalVotes: number
  voters: Set<string>
  results: Record<
    string,
    {
      amount: number
      votes: number
      voters: Set<string>
      percentage: number
    }
  >
}

const MIN_POLL_OPTION_COUNT = 2
const DEFAULT_POLL_DURATION_SECONDS = 24 * 60 * 60

export function getDefaultPollEndsAt(nowSeconds = Math.floor(Date.now() / 1000)) {
  return nowSeconds + DEFAULT_POLL_DURATION_SECONDS
}

export function createPollOption(option: Partial<TPollOption> = {}): TPollOption {
  const id = typeof option.id === 'string' && option.id.trim() ? option.id.trim() : randomString(9)
  const label = typeof option.label === 'string' ? option.label : ''
  const image = typeof option.image === 'string' && option.image.trim() ? option.image.trim() : undefined

  return image ? { id, label, image } : { id, label }
}

export function normalizePollOptions(options?: TLegacyPollOption[]) {
  const usedIds = new Set<string>()
  const normalizedOptions = (options ?? [])
    .filter((option): option is Exclude<TLegacyPollOption, null | undefined> => {
      return option !== null && option !== undefined
    })
    .map((option) => {
      const normalizedOption =
        typeof option === 'string' ? createPollOption({ label: option }) : createPollOption(option)

      if (usedIds.has(normalizedOption.id)) {
        normalizedOption.id = randomString(9)
      }

      usedIds.add(normalizedOption.id)
      return normalizedOption
    })

  while (normalizedOptions.length < MIN_POLL_OPTION_COUNT) {
    const nextOption = createPollOption()
    usedIds.add(nextOption.id)
    normalizedOptions.push(nextOption)
  }

  return normalizedOptions
}

export function createDefaultPollCreateData(): TPollCreateData {
  return {
    isMultipleChoice: false,
    options: normalizePollOptions(),
    endsAt: getDefaultPollEndsAt(),
    relays: []
  }
}

export function normalizePollCreateData(
  pollCreateData?: Partial<TPollCreateData> & { options?: TLegacyPollOption[] }
): TPollCreateData {
  return {
    isMultipleChoice: !!pollCreateData?.isMultipleChoice,
    options: normalizePollOptions(pollCreateData?.options),
    endsAt:
      typeof pollCreateData?.endsAt === 'number' && Number.isFinite(pollCreateData.endsAt)
        ? pollCreateData.endsAt
        : undefined,
    relays: Array.isArray(pollCreateData?.relays)
      ? pollCreateData.relays.filter((relay): relay is string => typeof relay === 'string' && !!relay)
      : []
  }
}

export function isValidLegacyZapPollAmount(amount: number, poll: TLegacyZapPollConfig) {
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (typeof poll.minZapAmount === 'number' && amount < poll.minZapAmount) return false
  if (typeof poll.maxZapAmount === 'number' && amount > poll.maxZapAmount) return false
  return true
}

export function getDefaultLegacyZapPollAmount(
  poll: TLegacyZapPollConfig,
  preferredAmount?: number
) {
  if (
    typeof poll.minZapAmount === 'number' &&
    typeof poll.maxZapAmount === 'number' &&
    poll.minZapAmount === poll.maxZapAmount
  ) {
    return poll.minZapAmount
  }

  if (
    typeof preferredAmount === 'number' &&
    isValidLegacyZapPollAmount(Math.floor(preferredAmount), poll)
  ) {
    return Math.floor(preferredAmount)
  }

  if (typeof poll.minZapAmount === 'number') {
    return poll.minZapAmount
  }

  if (typeof poll.maxZapAmount === 'number') {
    return poll.maxZapAmount
  }

  return typeof preferredAmount === 'number' && preferredAmount > 0 ? Math.floor(preferredAmount) : 21
}

export function getLegacyZapPollResults(poll: TLegacyZapPollConfig, zaps: TLegacyZapVote[]) {
  const validOptionIds = new Set(poll.options.map((option) => option.id))
  const results = poll.options.reduce(
    (acc, option) => {
      acc[option.id] = {
        amount: 0,
        votes: 0,
        voters: new Set<string>(),
        percentage: 0
      }
      return acc
    },
    {} as TLegacyZapPollResults['results']
  )

  let totalAmount = 0
  let totalVotes = 0
  const voters = new Set<string>()

  zaps.forEach((zap) => {
    if (!zap.pollOptionId || !validOptionIds.has(zap.pollOptionId)) return
    if (!isValidLegacyZapPollAmount(zap.amount, poll)) return

    totalAmount += zap.amount
    totalVotes += 1
    voters.add(zap.pubkey)

    const result = results[zap.pollOptionId]
    if (!result) return
    result.amount += zap.amount
    result.votes += 1
    result.voters.add(zap.pubkey)
  })

  Object.values(results).forEach((result) => {
    result.percentage = totalAmount > 0 ? (result.amount / totalAmount) * 100 : 0
  })

  return {
    totalAmount,
    totalVotes,
    voters,
    results
  }
}
