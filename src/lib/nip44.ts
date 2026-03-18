import * as nip44 from 'nostr-tools/nip44'

/**
 * Encrypt plaintext using NIP-44 v2 encryption
 * @param privkey - Private key as Uint8Array
 * @param pubkey - Public key as hex string
 * @param plaintext - Plain text to encrypt
 * @returns Base64 encoded encrypted payload
 */
export function encrypt(privkey: Uint8Array, pubkey: string, plaintext: string): string {
  const conversationKey = nip44.getConversationKey(privkey, pubkey)
  return nip44.encrypt(plaintext, conversationKey)
}

/**
 * Decrypt ciphertext using NIP-44 v2 encryption
 * @param privkey - Private key as Uint8Array
 * @param pubkey - Public key as hex string
 * @param ciphertext - Base64 encoded encrypted payload
 * @returns Decrypted plain text
 */
export function decrypt(privkey: Uint8Array, pubkey: string, ciphertext: string): string {
  const conversationKey = nip44.getConversationKey(privkey, pubkey)
  return nip44.decrypt(ciphertext, conversationKey)
}
