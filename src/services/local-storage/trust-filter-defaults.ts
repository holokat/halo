export type TStoredTrustFilterSettings = {
  legacy?: boolean | null
  interactions?: boolean | null
  notifications?: boolean | null
  notes?: boolean | null
}

export function resolveTrustFilterDefaults({
  legacy,
  interactions,
  notifications,
  notes
}: TStoredTrustFilterSettings) {
  return {
    interactions: interactions ?? legacy ?? false,
    notifications: notifications ?? legacy ?? true,
    notes: notes ?? legacy ?? false
  }
}
