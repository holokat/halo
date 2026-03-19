import { TPollCreateData, TPollOption } from '@/types'
import { randomString } from './random'

type TLegacyPollOption = string | Partial<TPollOption> | null | undefined

const MIN_POLL_OPTION_COUNT = 2

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
    endsAt: undefined,
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
