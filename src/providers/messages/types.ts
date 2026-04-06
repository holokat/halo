import { Event } from 'nostr-tools'

export type TConversationEventBase = {
  id: string
  wrapId: string
  createdAt: number
  senderPubkey: string
  recipientPubkeys: string[]
  participantPubkeys: string[]
  conversationId: string
  isOutgoing: boolean
}

export type TDirectMessage = TConversationEventBase & {
  kind: number
  tags: string[][]
  content: string
  subject?: string
  replyToId?: string
}

export type TDirectMessageReaction = TConversationEventBase & {
  targetMessageId: string
  emoji: string
}

export type TConversationEvent = TDirectMessage | TDirectMessageReaction

export type TMessageConversation = {
  id: string
  participantPubkeys: string[]
  primaryPubkey?: string
  isGroup: boolean
  isRequest: boolean
  unreadCount: number
  lastMessageAt: number
  lastMessagePreview: string
  subject?: string
  messages: TDirectMessage[]
  reactionsByMessageId: Record<string, TDirectMessageReaction[]>
  hasOutgoingActivity: boolean
}

export type TWrappedRumorEvent = {
  recipientPubkey: string
  wrapEvent: Event
  relayUrls: string[]
}
