import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Content, JSONContent } from '@tiptap/react'
import { nip19, type Event } from 'nostr-tools'

export const COMPOSER_QUOTE_NODE = 'quotedNote'

export function getComposerQuoteId(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const id = value.trim().replace(/^nostr:/, '')
  try {
    const decoded = nip19.decode(id)
    if (['note', 'nevent', 'naddr'].includes(decoded.type)) return id
  } catch {
    // Ordinary text and invalid references stay editable as text.
  }
}

export function serializeComposerQuote(id: unknown): string {
  const quoteId = getComposerQuoteId(id)
  return quoteId ? `nostr:${quoteId}\n` : ''
}

export function isComposerQuoteForEvent(id: string, event: Event): boolean {
  try {
    const decoded = nip19.decode(id)
    if (decoded.type === 'note') return decoded.data === event.id
    if (decoded.type === 'nevent') return decoded.data.id === event.id
    if (decoded.type === 'naddr') {
      return (
        decoded.data.pubkey === event.pubkey &&
        decoded.data.kind === event.kind &&
        decoded.data.identifier === (event.tags.find(([name]) => name === 'd')?.[1] ?? '')
      )
    }
  } catch {
    return false
  }
  return false
}

function normalizeParagraph(node: JSONContent): JSONContent[] {
  if (node.type !== 'paragraph') return [node]
  const lines: JSONContent[][] = [[]]
  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') {
      lines.push([])
    } else if (child.type === 'text') {
      const parts = (child.text ?? '').split('\n')
      parts.forEach((text, index) => {
        if (index > 0) lines.push([])
        if (text) lines[lines.length - 1].push({ ...child, text })
      })
    } else {
      lines[lines.length - 1].push(child)
    }
  }

  const quoteIds = lines.map((line) =>
    line.every((child) => child.type === 'text')
      ? getComposerQuoteId(line.map((child) => child.text ?? '').join(''))
      : undefined
  )
  if (!quoteIds.some(Boolean)) return [node]

  const blocks: JSONContent[] = []
  let paragraph: JSONContent | undefined
  lines.forEach((line, index) => {
    const id = quoteIds[index]
    if (id) {
      if (paragraph) blocks.push(paragraph)
      paragraph = undefined
      blocks.push({ type: COMPOSER_QUOTE_NODE, attrs: { id } })
    } else {
      if (!paragraph) paragraph = { ...node, content: [] }
      else paragraph.content!.push({ type: 'hardBreak' })
      paragraph.content!.push(...line)
    }
  })
  if (paragraph) blocks.push(paragraph)
  return blocks
}

// Keep quotes in the document so copying, drafts, previews, and publishing retain the reference.
export function normalizeComposerQuotes(content: Content | undefined): Content | undefined {
  if (typeof content === 'string') {
    const id = getComposerQuoteId(content)
    if (!id) return content
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: COMPOSER_QUOTE_NODE, attrs: { id } }]
    }
  }
  if (!content) return content
  const doc: JSONContent = Array.isArray(content) ? { type: 'doc', content } : content
  if (doc.type !== 'doc') return content
  const blocks = (doc.content ?? []).flatMap(normalizeParagraph)
  if (blocks[0]?.type === COMPOSER_QUOTE_NODE) blocks.unshift({ type: 'paragraph' })
  return { ...doc, content: blocks }
}

export function getComposerFocusPosition(doc: ProseMirrorNode): number | 'end' {
  let textPosition: number | undefined
  let hasQuote = false
  doc.forEach((node, offset) => {
    if (hasQuote) return
    if (node.type.name === COMPOSER_QUOTE_NODE) hasQuote = true
    else if (node.isTextblock) textPosition = offset + node.nodeSize - 1
  })
  return hasQuote && textPosition !== undefined ? textPosition : 'end'
}
