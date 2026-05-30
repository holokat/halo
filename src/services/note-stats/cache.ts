import type { TNoteStats } from '../note-stats.service'
import type { TNoteReaction } from '@/types'

export type TSerializedNoteStats = {
  likeIdSet?: string[]
  likes?: TNoteReaction[]
  repostPubkeySet?: string[]
  reposts?: { id: string; pubkey: string; created_at: number }[]
  updatedAt?: number
}

export function serializeNoteStats(stats: Partial<TNoteStats>): TSerializedNoteStats {
  return {
    likeIdSet: stats.likeIdSet ? Array.from(stats.likeIdSet) : [],
    likes: stats.likes ? [...stats.likes] : [],
    repostPubkeySet: stats.repostPubkeySet ? Array.from(stats.repostPubkeySet) : [],
    reposts: stats.reposts ? [...stats.reposts] : [],
    updatedAt: stats.updatedAt
  }
}

export function deserializeNoteStats(stats: TSerializedNoteStats): Partial<TNoteStats> {
  return {
    likeIdSet: new Set(stats.likeIdSet ?? []),
    likes: (stats.likes ?? []).map((like) => ({
      ...like,
      bonusCount: typeof like.bonusCount === 'number' ? like.bonusCount : 0
    })),
    repostPubkeySet: new Set(stats.repostPubkeySet ?? []),
    reposts: stats.reposts ?? [],
    updatedAt: stats.updatedAt
  }
}
