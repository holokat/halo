type ProfileFeedTab = {
  value: string
  label: string
}

type BuildProfileFeedTabsOptions = {
  lowBandwidthMode: boolean
  myPubkey?: string | null
  pubkey: string
  showReadsInProfiles: boolean
}

export function buildProfileFeedTabs({
  lowBandwidthMode,
  myPubkey,
  pubkey,
  showReadsInProfiles
}: BuildProfileFeedTabsOptions): ProfileFeedTab[] {
  const tabs: ProfileFeedTab[] = [
    { value: 'posts', label: 'Notes' },
    { value: 'postsAndReplies', label: 'Replies' }
  ]

  if (!lowBandwidthMode) {
    tabs.push({ value: 'media', label: 'Media' })
  }

  if (showReadsInProfiles) {
    tabs.push({ value: 'reads', label: 'Reads' })
  }

  if (myPubkey && myPubkey !== pubkey) {
    tabs.push({ value: 'you', label: 'YouTabName' })
  }

  return tabs
}
