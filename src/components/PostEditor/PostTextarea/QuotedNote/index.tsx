import { EmbeddedNote } from '@/components/Embedded/EmbeddedNote'
import Note from '@/components/Note'
import {
  COMPOSER_QUOTE_NODE,
  getComposerFocusPosition,
  getComposerQuoteId,
  isComposerQuoteForEvent,
  serializeComposerQuote
} from '@/lib/composer-quotes'
import { cn } from '@/lib/utils'
import { IconCrossLarge } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCrossLarge'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import type { Event } from 'nostr-tools'
import { useTranslation } from 'react-i18next'

function QuotedNoteView({ node, extension, selected, deleteNode, editor }: NodeViewProps) {
  const { t } = useTranslation()
  const id = node.attrs.id as string
  const quotedEvent = extension.options.quotedEvent as Event | undefined
  const event = quotedEvent && isComposerQuoteForEvent(id, quotedEvent) ? quotedEvent : undefined

  return (
    <NodeViewWrapper
      contentEditable={false}
      className={cn('relative my-3 rounded-xl', selected && 'ring-2 ring-primary/50')}
      aria-label={t('Quoted note', { defaultValue: 'Quoted note' })}
    >
      <div className="max-h-64 overflow-y-auto rounded-xl [&_header]:pr-8">
        <div className="pointer-events-none select-none">
          {event ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <Note size="small" event={event} hideParentNotePreview filterMutedNotes={false} />
            </div>
          ) : (
            <EmbeddedNote noteId={id} />
          )}
        </div>
      </div>
      <button
        type="button"
        className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('Remove quote', { defaultValue: 'Remove quote' })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          deleteNode()
          editor.commands.focus(getComposerFocusPosition(editor.state.doc))
        }}
      >
        <IconCrossLarge className="size-4" aria-hidden="true" />
      </button>
    </NodeViewWrapper>
  )
}

export default Node.create<{ quotedEvent?: Event }>({
  name: COMPOSER_QUOTE_NODE,
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return { quotedEvent: undefined }
  },

  addAttributes() {
    return { id: { default: null } }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-quoted-note]',
        getAttrs: (element) => {
          const id = getComposerQuoteId(element.getAttribute('data-quoted-note'))
          return id ? { id } : false
        }
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-quoted-note': node.attrs.id }),
      serializeComposerQuote(node.attrs.id).trim()
    ]
  },

  renderText({ node }) {
    return serializeComposerQuote(node.attrs.id).trim()
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuotedNoteView)
  }
})
