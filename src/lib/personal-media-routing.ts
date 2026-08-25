export const PERSONAL_MEDIA_OWNER_PUBKEY =
  '1bc70a0148b3f316da33fe3c89f23e3e71ac4ff998027ec712b905cd24f6a411'

export const PERSONAL_MEDIA_BLOSSOM_SERVER = 'https://media.21media.to'

export function getPersonalMediaBlossomServers(pubkey: string | null | undefined): string[] | null {
  const normalizedPubkey = pubkey?.trim().toLowerCase()
  return normalizedPubkey === PERSONAL_MEDIA_OWNER_PUBKEY ? [PERSONAL_MEDIA_BLOSSOM_SERVER] : null
}
