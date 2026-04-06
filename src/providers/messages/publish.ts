import { encrypt as encryptNip44 } from '@/lib/nip44'
import { checkAuthProtectedRelay } from '@/lib/relay'
import client from '@/services/client.service'
import relayInfoService from '@/services/relay-info.service'
import { Event, finalizeEvent, generateSecretKey, kinds, VerifiedEvent } from 'nostr-tools'
import { TWrappedRumorEvent } from './types'
import { randomWrappedTimestamp } from './shared'

const RELAY_INFO_LOOKUP_TIMEOUT_MS = 1_500

async function preferAuthProtectedRelayUrls(relayUrls: string[]) {
  const uniqueRelayUrls = Array.from(new Set(relayUrls))

  if (uniqueRelayUrls.length <= 1) {
    return uniqueRelayUrls
  }

  try {
    const relayInfos = await Promise.race([
      relayInfoService.getRelayInfos(uniqueRelayUrls),
      new Promise<
        ReturnType<typeof relayInfoService.getRelayInfos> extends Promise<infer T> ? T : never
      >((resolve) => {
        window.setTimeout(() => resolve([]), RELAY_INFO_LOOKUP_TIMEOUT_MS)
      })
    ])

    const authProtectedRelayUrls = uniqueRelayUrls.filter((url, index) =>
      checkAuthProtectedRelay(relayInfos[index])
    )

    return authProtectedRelayUrls.length > 0 ? authProtectedRelayUrls : uniqueRelayUrls
  } catch {
    return uniqueRelayUrls
  }
}

export async function buildWrappedRumorEvents({
  fetchInboxRelayList,
  nip44Encrypt,
  pubkey,
  publishedInboxRelayUrls,
  rumorEvent,
  rumorRecipients,
  signEvent
}: {
  fetchInboxRelayList: (pubkey: string) => Promise<string[]>
  nip44Encrypt: (pubkey: string, plainText: string) => Promise<string>
  pubkey: string
  publishedInboxRelayUrls: string[]
  rumorEvent: Event
  rumorRecipients: string[]
  signEvent: (draftEvent: {
    kind: number
    content: string
    created_at: number
    tags: string[][]
    pubkey: string
  }) => Promise<VerifiedEvent>
}): Promise<TWrappedRumorEvent[]> {
  const wrapRecipients = Array.from(new Set([pubkey, ...rumorRecipients]))
  const recipientRelayEntries = await Promise.all(
    wrapRecipients.map(async (recipientPubkey) => {
      const recipientRelayUrls =
        recipientPubkey === pubkey
          ? publishedInboxRelayUrls
          : await fetchInboxRelayList(recipientPubkey)

      return [recipientPubkey, Array.from(new Set(recipientRelayUrls))] as const
    })
  )
  const recipientRelayMap = new Map(recipientRelayEntries)

  if (recipientRelayEntries.some(([, recipientRelayUrls]) => recipientRelayUrls.length === 0)) {
    throw new Error('One or more recipients have not published NIP-17 inbox relays yet.')
  }

  return Promise.all(
    wrapRecipients.map(async (recipientPubkey) => {
      const recipientRelayUrls = recipientRelayMap.get(recipientPubkey) ?? []
      const sealEvent = await signEvent({
        kind: kinds.Seal,
        content: await nip44Encrypt(recipientPubkey, JSON.stringify(rumorEvent)),
        created_at: randomWrappedTimestamp(),
        tags: [],
        pubkey
      })

      const randomKey = generateSecretKey()
      const wrapEvent = finalizeEvent(
        {
          kind: kinds.GiftWrap,
          content: encryptNip44(randomKey, recipientPubkey, JSON.stringify(sealEvent)),
          created_at: randomWrappedTimestamp(),
          tags: [
            recipientRelayUrls[0]
              ? ['p', recipientPubkey, recipientRelayUrls[0]]
              : ['p', recipientPubkey]
          ]
        },
        randomKey
      )

      return { recipientPubkey, wrapEvent, relayUrls: recipientRelayUrls }
    })
  )
}

export async function publishWrappedRumorEvents(wrappedEvents: TWrappedRumorEvent[]) {
  return Promise.allSettled(
    wrappedEvents.map(async ({ relayUrls, wrapEvent }) => {
      await client.publishEvent(await preferAuthProtectedRelayUrls(relayUrls), wrapEvent)
    })
  )
}
