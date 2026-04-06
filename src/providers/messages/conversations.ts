import {
  TDirectMessage,
  TDirectMessageReaction,
  TMessageConversation
} from './types'
import { getConversationMessagePreview } from './decrypt'

export function mergeMessages(current: TDirectMessage[], incoming: TDirectMessage[]) {
  const messageMap = new Map<string, TDirectMessage>()

  current.forEach((message) => {
    messageMap.set(message.id, message)
  })

  incoming.forEach((message) => {
    messageMap.set(message.id, message)
  })

  return Array.from(messageMap.values()).sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt
    }
    return b.wrapId.localeCompare(a.wrapId)
  })
}

export function mergeReactions(current: TDirectMessageReaction[], incoming: TDirectMessageReaction[]) {
  const reactionMap = new Map<string, TDirectMessageReaction>()

  current.forEach((reaction) => {
    reactionMap.set(reaction.id, reaction)
  })

  incoming.forEach((reaction) => {
    reactionMap.set(reaction.id, reaction)
  })

  return Array.from(reactionMap.values()).sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt
    }
    return b.wrapId.localeCompare(a.wrapId)
  })
}

export function dedupeWrappedEvents<T extends { id: string; created_at: number }>(events: T[]) {
  const wrappedEventMap = new Map<string, T>()

  events.forEach((event) => {
    wrappedEventMap.set(event.id, event)
  })

  return Array.from(wrappedEventMap.values()).sort((a, b) => {
    if (b.created_at !== a.created_at) {
      return b.created_at - a.created_at
    }

    return b.id.localeCompare(a.id)
  })
}

type TBuildConversationsInput = {
  conversationReadAtMap: Record<string, number>
  followings: string[]
  messages: TDirectMessage[]
  messagesReadAt: number
  reactions: TDirectMessageReaction[]
}

export function buildConversations({
  conversationReadAtMap,
  followings,
  messages,
  messagesReadAt,
  reactions
}: TBuildConversationsInput): TMessageConversation[] {
  const followingSet = new Set(followings)
  const conversationMap = new Map<string, TMessageConversation>()

  const sortedMessages = messages
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))

  sortedMessages.forEach((message) => {
    const existingConversation = conversationMap.get(message.conversationId)

    if (!existingConversation) {
      conversationMap.set(message.conversationId, {
        id: message.conversationId,
        participantPubkeys: message.participantPubkeys,
        primaryPubkey: message.participantPubkeys[0],
        isGroup: message.participantPubkeys.length > 1,
        isRequest: false,
        unreadCount: 0,
        lastMessageAt: message.createdAt,
        lastMessagePreview: getConversationMessagePreview(message),
        subject: message.subject,
        messages: [message],
        reactionsByMessageId: {},
        hasOutgoingActivity: message.isOutgoing
      })
      return
    }

    existingConversation.messages.push(message)
    existingConversation.lastMessageAt = message.createdAt
    existingConversation.lastMessagePreview = getConversationMessagePreview(message)
    existingConversation.subject = message.subject ?? existingConversation.subject
    existingConversation.hasOutgoingActivity =
      existingConversation.hasOutgoingActivity || message.isOutgoing
  })

  const messageIdsByConversation = new Map<string, Set<string>>(
    Array.from(conversationMap.entries()).map(([conversationId, conversation]) => [
      conversationId,
      new Set(conversation.messages.map((message) => message.id))
    ])
  )

  reactions
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.wrapId.localeCompare(b.wrapId))
    .forEach((reaction) => {
      const conversation = conversationMap.get(reaction.conversationId)
      const messageIds = messageIdsByConversation.get(reaction.conversationId)

      if (!conversation || !messageIds?.has(reaction.targetMessageId)) {
        return
      }

      const existingReactions = conversation.reactionsByMessageId[reaction.targetMessageId] ?? []
      conversation.reactionsByMessageId[reaction.targetMessageId] = [
        ...existingReactions,
        reaction
      ]
      conversation.hasOutgoingActivity = conversation.hasOutgoingActivity || reaction.isOutgoing
    })

  return Array.from(conversationMap.values())
    .map((conversation) => {
      const conversationReadAt = Math.max(messagesReadAt, conversationReadAtMap[conversation.id] ?? 0)
      const unreadCount = conversation.messages.filter(
        (message) => !message.isOutgoing && message.createdAt > conversationReadAt
      ).length
      const isSingleParticipantConversation = conversation.participantPubkeys.length === 1
      const isGroupConversation = conversation.participantPubkeys.length > 1
      const primaryParticipantPubkey = conversation.primaryPubkey

      return {
        ...conversation,
        unreadCount,
        isRequest: isGroupConversation
          ? !conversation.hasOutgoingActivity
          : isSingleParticipantConversation &&
            !!primaryParticipantPubkey &&
            !followingSet.has(primaryParticipantPubkey) &&
            !conversation.hasOutgoingActivity
      }
    })
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}
