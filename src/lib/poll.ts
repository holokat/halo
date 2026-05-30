import { TPollCreateData, TPollOption } from '@/types'
import { randomString } from './random'

type TStoredPollOption = string | Partial<TPollOption> | null | undefined

const MIN_POLL_OPTION_COUNT = 2
const DEFAULT_POLL_DURATION_SECONDS = 24 * 60 * 60

export function getDefaultPollEndsAt(nowSeconds = Math.floor(Date.now() / 1000)) {
  return nowSeconds + DEFAULT_POLL_DURATION_SECONDS
}

export function createPollOption(option: Partial<TPollOption> = {}): TPollOption {
  const id = typeof option.id === 'string' && option.id.trim() ? option.id.trim() : randomString(9)
  const label = typeof option.label === 'string' ? option.label : ''
  const image =
    typeof option.image === 'string' && option.image.trim() ? option.image.trim() : undefined

  return image ? { id, label, image } : { id, label }
}

export function normalizePollOptions(options?: TStoredPollOption[]) {
  const usedIds = new Set<string>()
  const normalizedOptions = (options ?? [])
    .filter((option): option is Exclude<TStoredPollOption, null | undefined> => {
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
  pollCreateData?: Partial<TPollCreateData> & { options?: TStoredPollOption[] }
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
