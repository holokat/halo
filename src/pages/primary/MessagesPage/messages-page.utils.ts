import { useEffect, useMemo, useState } from 'react'
import { Event } from 'nostr-tools'
import confetti from 'canvas-confetti'
import { TDirectMessage, TDirectMessageReaction, TMessageConversation } from '@/providers/MessagesProvider'
import dmMediaService, { getDmFileEncryptionInfo } from '@/services/dm-media.service'
import { TEmoji } from '@/types'
import { ZAP_SOUNDS, ACTUAL_ZAP_SOUNDS } from '@/constants'

export const MAX_VISIBLE_MESSAGES = 50
export const VOICE_WAVE_BAR_COUNT = 30

export type TOverviewTab = 'conversations' | 'requests'
export type TMessagesViewMode = 'index' | 'compose' | 'thread'

export type TSpeechRecognitionLikeResult = {
  isFinal: boolean
  0: {
    transcript: string
  }
}

export type TSpeechRecognitionLikeResultEvent = {
  resultIndex: number
  results: ArrayLike<TSpeechRecognitionLikeResult>
}

export type TSpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: TSpeechRecognitionLikeResultEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type TReactionSummary = {
  emoji: string
  count: number
  isMine: boolean
  lastCreatedAt: number
}

export type TComposerAttachment = {
  url: string
  previewUrl?: string
  previewType?: string
} & (
  | {
      mode: 'encrypted'
      fileTags: string[][]
    }
  | {
      mode: 'legacy'
      imetaTag?: string[]
    }
)

export type TUploadProgressItem = {
  file: File
  progress: number
  cancel: () => void
}

export function formatVoiceDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function toConversationId(participantPubkeys: string[]) {
  return participantPubkeys.slice().sort().join(':')
}

export function playZapSound(zapSound: string, isWalletConnected: boolean) {
  if (!isWalletConnected || zapSound === ZAP_SOUNDS.NONE) {
    return
  }

  let soundToPlay = zapSound

  if (zapSound === ZAP_SOUNDS.RANDOM) {
    const randomIndex = Math.floor(Math.random() * ACTUAL_ZAP_SOUNDS.length)
    soundToPlay = ACTUAL_ZAP_SOUNDS[randomIndex]
  }

  const audio = new Audio(`/sounds/${soundToPlay}.mp3`)
  audio.volume = 0.5
  audio.play().catch(() => {})
}

export function calculateChargeZapAmount(holdDuration: number, limit: number): number {
  let amount = 0

  if (holdDuration <= 500) {
    amount = Math.floor(holdDuration / 100)
  } else if (holdDuration <= 1500) {
    amount = 5 + Math.floor((holdDuration - 500) / 50)
  } else if (holdDuration <= 3000) {
    amount = 25 + Math.floor((holdDuration - 1500) / 20)
  } else {
    amount = 100 + Math.floor((holdDuration - 3000) / 10)
  }

  return Math.min(amount, limit)
}

export function fireChargeZapConfetti(element: HTMLElement, amount: number, limit: number) {
  const rect = element.getBoundingClientRect()
  const x = (rect.left + rect.width / 2) / window.innerWidth
  const y = (rect.top + rect.height / 2) / window.innerHeight
  const intensity = amount / limit
  const particleCount = Math.floor(30 + intensity * 120)
  const spread = 60 + intensity * 60

  confetti({
    particleCount,
    spread,
    origin: { x, y },
    colors: ['#FFD700', '#FFA500', '#FF8C00', '#FFFF00', '#FFE55C'],
    ticks: 200,
    gravity: 1.2,
    decay: 0.94,
    startVelocity: 20 + intensity * 30,
    scalar: 0.8 + intensity * 0.7
  })
}

export function findDirectConversationByPubkey(
  conversations: TMessageConversation[],
  pubkey: string
) {
  return conversations.find(
    (conversation) =>
      conversation.participantPubkeys.length === 1 && conversation.primaryPubkey === pubkey
  )
}

export function normalizeRecipientPubkeys(pubkeys: string[], accountPubkey?: string | null) {
  return Array.from(new Set(pubkeys.map((pubkey) => pubkey.trim()).filter(Boolean))).filter(
    (pubkey) => pubkey !== accountPubkey
  )
}

export function findConversationByParticipants(
  conversations: TMessageConversation[],
  participantPubkeys: string[]
) {
  if (participantPubkeys.length === 0) {
    return null
  }

  const conversationId = toConversationId(participantPubkeys)
  return conversations.find((conversation) => conversation.id === conversationId) ?? null
}

export function revokeBlobUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function summarizeMessageReactions(
  reactions: TDirectMessageReaction[],
  accountPubkey?: string | null
) {
  const latestReactionBySender = new Map<string, TDirectMessageReaction>()

  reactions
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))
    .forEach((reaction) => {
      latestReactionBySender.set(reaction.senderPubkey, reaction)
    })

  const summaries = new Map<string, TReactionSummary>()

  Array.from(latestReactionBySender.values()).forEach((reaction) => {
    const existingSummary = summaries.get(reaction.emoji)

    if (existingSummary) {
      summaries.set(reaction.emoji, {
        ...existingSummary,
        count: existingSummary.count + 1,
        isMine: existingSummary.isMine || reaction.senderPubkey === accountPubkey,
        lastCreatedAt: Math.max(existingSummary.lastCreatedAt, reaction.createdAt)
      })
      return
    }

    summaries.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: 1,
      isMine: reaction.senderPubkey === accountPubkey,
      lastCreatedAt: reaction.createdAt
    })
  })

  return Array.from(summaries.values()).sort((a, b) => a.lastCreatedAt - b.lastCreatedAt)
}

export function toRenderableConversationEvent(message: TDirectMessage, contentOverride?: string) {
  return {
    id: message.id,
    pubkey: message.senderPubkey,
    created_at: message.createdAt,
    kind: message.kind,
    tags: message.tags,
    content: contentOverride ?? message.content
  } as Event
}

export function useRenderableMessageContent(message: TDirectMessage) {
  const encryptionInfo = useMemo(
    () => (message.kind === 15 ? getDmFileEncryptionInfo(message.tags) : null),
    [message.kind, message.tags]
  )
  const [renderableContent, setRenderableContent] = useState(
    encryptionInfo ? '' : message.content
  )
  const [isDecrypting, setIsDecrypting] = useState(!!encryptionInfo)
  const [hasDecryptError, setHasDecryptError] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (!encryptionInfo) {
      setRenderableContent(message.content)
      setIsDecrypting(false)
      setHasDecryptError(false)
      return () => {
        cancelled = true
      }
    }

    setRenderableContent('')
    setIsDecrypting(true)
    setHasDecryptError(false)

    void dmMediaService
      .decryptMessageFileContent(message.id, message.content, message.tags)
      .then((decryptedContentUrl) => {
        if (cancelled) return
        setRenderableContent(decryptedContentUrl)
      })
      .catch(() => {
        if (cancelled) return
        setRenderableContent('')
        setHasDecryptError(true)
      })
      .finally(() => {
        if (cancelled) return
        setIsDecrypting(false)
      })

    return () => {
      cancelled = true
    }
  }, [encryptionInfo, message.content, message.id, message.tags])

  return {
    renderableContent,
    isDecrypting,
    hasDecryptError,
    isEncryptedFileMessage: !!encryptionInfo,
    isFileMessage: message.kind === 15,
    encryptedFileType: encryptionInfo?.fileType
  }
}
