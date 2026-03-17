import { BIG_RELAY_URLS, CODY_PUBKEY, JUMBLE_API_BASE_URL, JUMBLE_PUBKEY } from '@/constants'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import {
  getLightningAddressCandidatesFromProfile,
  isLnurl,
  normalizeLightningAddress
} from '@/lib/lightning'
import { TProfile } from '@/types'
import { init, launchPaymentModal } from '@getalby/bitcoin-connect-react'
import { Invoice } from '@getalby/lightning-tools'
import { bech32 } from '@scure/base'
import { WebLNProvider } from '@webbtc/webln-types'
import dayjs from 'dayjs'
import { Filter, kinds, NostrEvent } from 'nostr-tools'
import { SubCloser } from 'nostr-tools/abstract-pool'
import { makeZapRequest } from 'nostr-tools/nip57'
import { utf8Decoder } from 'nostr-tools/utils'
import client from './client.service'

export type TRecentSupporter = { pubkey: string; amount: number; comment?: string }

const OFFICIAL_PUBKEYS = [JUMBLE_PUBKEY, CODY_PUBKEY]

class LightningService {
  static instance: LightningService
  provider: WebLNProvider | null = null
  private recentSupportersCache: TRecentSupporter[] | null = null

  constructor() {
    if (!LightningService.instance) {
      LightningService.instance = this
      init({
        appName: 'Jumble',
        showBalance: false
      })
    }
    return LightningService.instance
  }

  async zap(
    sender: string,
    recipientOrEventOrCoordinate: string | NostrEvent,
    sats: number,
    comment: string,
    closeOuterModel?: () => void
  ): Promise<{ preimage: string; invoice: string } | null> {
    if (!client.signer) {
      throw new Error('You need to be logged in to zap')
    }

    // Parse recipient and event/coordinate
    let recipient: string
    let event: NostrEvent | undefined
    let coordinate: string | undefined

    if (typeof recipientOrEventOrCoordinate === 'string') {
      // Check if it's a coordinate (format: kind:pubkey:d-tag)
      if (recipientOrEventOrCoordinate.includes(':')) {
        const parts = recipientOrEventOrCoordinate.split(':')
        if (parts.length === 3) {
          // It's a coordinate
          coordinate = recipientOrEventOrCoordinate
          recipient = parts[1] // Extract pubkey from coordinate
        } else {
          // It's just a pubkey
          recipient = recipientOrEventOrCoordinate
        }
      } else {
        recipient = recipientOrEventOrCoordinate
      }
    } else {
      recipient = recipientOrEventOrCoordinate.pubkey
      event = recipientOrEventOrCoordinate
    }

    const [freshProfile, cachedProfile, receiptRelayList, senderRelayList] = await Promise.all([
      client.fetchProfile(recipient, true).catch(() => undefined),
      client.fetchProfile(recipient).catch(() => undefined),
      client.fetchRelayList(recipient),
      sender
        ? client.fetchRelayList(sender)
        : Promise.resolve({ read: BIG_RELAY_URLS, write: BIG_RELAY_URLS })
    ])
    const profile =
      [freshProfile, cachedProfile].find(
        (item): item is TProfile => {
          if (!item) return false
          return getLightningAddressCandidatesFromProfile(item).length > 0
        }
      ) ??
      freshProfile ??
      cachedProfile
    if (!profile) {
      throw new Error('Recipient not found')
    }
    const zapEndpoint = await this.getZapEndpoint(profile)
    const { callback, lnurl } = zapEndpoint
    const amount = sats * 1000
    const zapRequestDraft = makeZapRequest({
      ...(event ? { event } : coordinate ? { pubkey: recipient } : { pubkey: recipient }),
      amount,
      relays: receiptRelayList.read
        .slice(0, 4)
        .concat(senderRelayList.write.slice(0, 3))
        .concat(BIG_RELAY_URLS),
      comment
    })

    // If we have a coordinate, add the 'a' tag manually
    if (coordinate) {
      zapRequestDraft.tags.push(['a', coordinate])
    }
    const zapRequest = await client.signer.signEvent(zapRequestDraft)
    const zapRequestRes = await fetch(
      `${callback}?amount=${amount}&nostr=${encodeURI(JSON.stringify(zapRequest))}&lnurl=${lnurl}`
    )
    const zapRequestResBody = await zapRequestRes.json()
    if (zapRequestResBody.error) {
      throw new Error(zapRequestResBody.message)
    }
    const { pr, verify, reason } = zapRequestResBody
    if (!pr) {
      throw new Error(reason ?? 'Failed to create invoice')
    }

    if (this.provider) {
      const { preimage } = await this.provider.sendPayment(pr)
      closeOuterModel?.()
      return { preimage, invoice: pr }
    }

    return new Promise((resolve) => {
      closeOuterModel?.()
      let checkPaymentInterval: ReturnType<typeof setInterval> | undefined
      let subCloser: SubCloser | undefined
      const { setPaid } = launchPaymentModal({
        invoice: pr,
        onPaid: (response) => {
          clearInterval(checkPaymentInterval)
          subCloser?.close()
          resolve({ preimage: response.preimage, invoice: pr })
        },
        onCancelled: () => {
          clearInterval(checkPaymentInterval)
          subCloser?.close()
          resolve(null)
        }
      })

      if (verify) {
        checkPaymentInterval = setInterval(async () => {
          const invoice = new Invoice({ pr, verify })
          const paid = await invoice.verifyPayment()

          if (paid && invoice.preimage) {
            setPaid({
              preimage: invoice.preimage
            })
          }
        }, 1000)
      } else {
        const filter: Filter = {
          kinds: [kinds.Zap],
          '#p': [recipient],
          since: dayjs().subtract(1, 'minute').unix()
        }
        if (event) {
          filter['#e'] = [event.id]
        } else if (coordinate) {
          filter['#a'] = [coordinate]
        }
        subCloser = client.subscribe(
          senderRelayList.write.concat(BIG_RELAY_URLS).slice(0, 4),
          filter,
          {
            onevent: (evt) => {
              const info = getZapInfoFromEvent(evt)
              if (!info) return

              if (info.invoice === pr) {
                setPaid({ preimage: info.preimage ?? '' })
              }
            }
          }
        )
      }
    })
  }

  async payInvoice(
    invoice: string,
    closeOuterModel?: () => void
  ): Promise<{ preimage: string; invoice: string } | null> {
    if (this.provider) {
      const { preimage } = await this.provider.sendPayment(invoice)
      closeOuterModel?.()
      return { preimage, invoice: invoice }
    }

    return new Promise((resolve) => {
      closeOuterModel?.()
      launchPaymentModal({
        invoice: invoice,
        onPaid: (response) => {
          resolve({ preimage: response.preimage, invoice: invoice })
        },
        onCancelled: () => {
          resolve(null)
        }
      })
    })
  }

  async fetchRecentSupporters() {
    if (this.recentSupportersCache) {
      return this.recentSupportersCache
    }
    const relayList = await client.fetchRelayList(CODY_PUBKEY)
    const events = await client.fetchEvents(relayList.read.slice(0, 4), {
      authors: ['79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432'], // alby
      kinds: [kinds.Zap],
      '#p': OFFICIAL_PUBKEYS,
      since: dayjs().subtract(1, 'month').unix()
    })
    events.sort((a, b) => b.created_at - a.created_at)
    const map = new Map<string, { pubkey: string; amount: number; comment?: string }>()
    events.forEach((event) => {
      const info = getZapInfoFromEvent(event)
      if (!info || !info.senderPubkey || OFFICIAL_PUBKEYS.includes(info.senderPubkey)) return

      const { amount, comment, senderPubkey } = info
      const item = map.get(senderPubkey)
      if (!item) {
        map.set(senderPubkey, { pubkey: senderPubkey, amount, comment })
      } else {
        item.amount += amount
        if (!item.comment && comment) item.comment = comment
      }
    })
    this.recentSupportersCache = Array.from(map.values())
      .filter((item) => item.amount >= 1000)
      .sort((a, b) => b.amount - a.amount)
    return this.recentSupportersCache
  }

  private async getZapEndpoint(profile: TProfile): Promise<{
    callback: string
    lnurl: string
  }> {
    const candidates = getLightningAddressCandidatesFromProfile(profile)
    if (!candidates.length) {
      throw new Error("Recipient doesn't have a lightning address configured")
    }

    let lastError: Error | null = null

    for (const lightningAddress of candidates) {
      try {
        return await this.resolveZapEndpoint(lightningAddress)
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Recipient's lightning address is invalid")
      }
    }

    throw lastError ?? new Error("Recipient's lightning address is invalid")
  }

  private async resolveZapEndpoint(lightningAddress: string): Promise<{
    callback: string
    lnurl: string
  }> {
    let lastError: Error | null = null

    for (const resolver of [
      this.fetchZapEndpointDirect.bind(this),
      this.fetchZapEndpointFromApi.bind(this)
    ]) {
      try {
        return await resolver(lightningAddress)
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Failed to fetch lightning address metadata')
      }
    }

    throw lastError ?? new Error('Failed to fetch lightning address metadata')
  }

  private async fetchZapEndpointDirect(lightningAddress: string): Promise<{
    callback: string
    lnurl: string
  }> {
    const lnurl = this.getLnurl(lightningAddress)
    const response = await fetch(lnurl, {
      headers: {
        Accept: 'application/json'
      }
    })
    const body = await this.parseJsonResponse(response)

    if (!response.ok || !body?.callback) {
      throw new Error(body?.reason || body?.error || 'Failed to fetch lightning address metadata')
    }
    if (!body.allowsNostr || !body.nostrPubkey) {
      throw new Error('Recipient does not support Nostr zaps')
    }

    return {
      callback: body.callback,
      lnurl
    }
  }

  private async fetchZapEndpointFromApi(lightningAddress: string): Promise<{
    callback: string
    lnurl: string
  }> {
    const url = new URL('/v1/lightning/zap-endpoint', JUMBLE_API_BASE_URL)
    url.searchParams.set('address', normalizeLightningAddress(lightningAddress))

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      }
    })
    const body = await this.parseJsonResponse(response)

    if (!response.ok || !body?.callback || !body?.lnurl) {
      throw new Error(body?.error || 'Failed to fetch lightning address metadata')
    }

    return {
      callback: body.callback,
      lnurl: body.lnurl
    }
  }

  private getLnurl(lightningAddress: string) {
    const normalizedLightningAddress = normalizeLightningAddress(lightningAddress)

    if (!normalizedLightningAddress) {
      throw new Error("Recipient doesn't have a lightning address configured")
    }

    if (normalizedLightningAddress.includes('@')) {
      const [name, domain] = normalizedLightningAddress.split('@')
      if (!name || !domain) {
        throw new Error("Recipient's lightning address is invalid")
      }

      return new URL(
        `/.well-known/lnurlp/${encodeURIComponent(name)}`,
        `https://${domain}`
      ).toString()
    }

    if (!isLnurl(normalizedLightningAddress)) {
      throw new Error("Recipient's lightning address is invalid")
    }

    const { words } = bech32.decode(normalizedLightningAddress.toLowerCase() as any, 5000)
    const data = bech32.fromWords(words)
    return utf8Decoder.decode(data)
  }

  private async parseJsonResponse(response: Response): Promise<any> {
    const rawBody = await response.text()
    if (!rawBody) return {}

    try {
      return JSON.parse(rawBody)
    } catch {
      throw new Error('Lightning address metadata returned invalid JSON')
    }
  }
}

const instance = new LightningService()
export default instance
