import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseEditorJsonToText } from '@/lib/tiptap'
import { cn } from '@/lib/utils'
import customEmojiService from '@/services/custom-emoji.service'
import postEditorCache from '@/services/post-editor-cache.service'
import { TEmoji, TLocalPostDraft } from '@/types'
import { HardBreak } from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { TextSelection } from '@tiptap/pm/state'
import type { Content, JSONContent } from '@tiptap/react'
import { EditorContent, useEditor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import { Event } from 'nostr-tools'
import {
  Dispatch,
  forwardRef,
  SetStateAction,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardAndDropHandler } from './ClipboardAndDropHandler'
import Emoji from './Emoji'
import emojiSuggestion from './Emoji/suggestion'
import Mention from './Mention'
import mentionSuggestion from './Mention/suggestion'
import Gif from './Gif'
import gifSuggestion from './Gif/suggestion'
import AICommand from './AICommand'
import aiCommandSuggestion from './AICommand/suggestion'
import ImageCommand from './ImageCommand'
import imageCommandSuggestion from './ImageCommand/suggestion'
import WebCommand from './WebCommand'
import webCommandSuggestion from './WebCommand/suggestion'
import Preview from './Preview'
import ImagePreview from '../ImagePreview'
import LocalDrafts from './LocalDrafts'

export type TPostTextareaHandle = {
  appendText: (text: string, addNewline?: boolean) => void
  insertText: (text: string) => void
  insertEmoji: (emoji: string | TEmoji) => void
  insertMention: (userId: string, position?: 'start' | 'end') => void
  replaceContent: (content: Content) => void
}

const PostTextarea = forwardRef<
  TPostTextareaHandle,
  {
    text: string
    setText: Dispatch<SetStateAction<string>>
    defaultContent?: string
    parentEvent?: Event
    onSubmit?: () => void
    className?: string
    isMobileComposer?: boolean
    placeholder?: string
    onUploadStart?: (file: File, cancel: () => void) => void
    onUploadProgress?: (file: File, progress: number) => void
    onUploadEnd?: (file: File) => void
    onImageUploadSuccess?: (url: string) => void
    images?: Array<{ url: string; alt?: string }>
    onRemoveImage?: (index: number) => void
    onUpdateImageAlt?: (index: number, alt: string) => void
    localDrafts?: TLocalPostDraft[]
    activeLocalDraftId?: string | null
    onSelectLocalDraft?: (draft: TLocalPostDraft) => void
    onDeleteLocalDraft?: (draftId: string) => void
  }
>(
  (
    {
      text = '',
      setText,
      defaultContent,
      parentEvent,
      onSubmit,
      className,
      isMobileComposer = false,
      placeholder,
      onUploadStart,
      onUploadProgress,
      onUploadEnd,
      onImageUploadSuccess,
      images = [],
      onRemoveImage,
      onUpdateImageAlt,
      localDrafts = [],
      activeLocalDraftId,
      onSelectLocalDraft,
      onDeleteLocalDraft
    },
    ref
  ) => {
    const { t } = useTranslation()
    const [tabValue, setTabValue] = useState('edit')
    const composerPlaceholder = placeholder ?? t('Enter text, paste or upload media')
    const editorClassName = cn(
      isMobileComposer
        ? 'rounded-none border-0 bg-transparent p-0 text-[16px] leading-6 focus-visible:outline-none focus-visible:ring-0'
        : 'rounded-2xl border p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      className
    )
    const editor = useEditor({
      extensions: [
        Document,
        Paragraph,
        Text,
        History,
        HardBreak,
        Placeholder.configure({
          placeholder: composerPlaceholder
        }),
        Emoji.configure({
          suggestion: emojiSuggestion
        }),
        Mention.configure({
          suggestion: mentionSuggestion
        }),
        Gif.configure({
          suggestion: gifSuggestion
        }),
        AICommand.configure({
          suggestion: aiCommandSuggestion,
          parentEvent
        }),
        ImageCommand.configure({
          suggestion: imageCommandSuggestion,
          parentEvent
        }),
        WebCommand.configure({
          suggestion: webCommandSuggestion,
          parentEvent
        }),
        ClipboardAndDropHandler.configure({
          onUploadStart: (file, cancel) => {
            onUploadStart?.(file, cancel)
          },
          onUploadEnd: (file) => onUploadEnd?.(file),
          onUploadProgress: (file, p) => onUploadProgress?.(file, p),
          onImageUploadSuccess: (url) => onImageUploadSuccess?.(url)
        })
      ],
      editorProps: {
        attributes: {
          class: editorClassName,
          'aria-label': composerPlaceholder,
          role: 'textbox',
          'aria-multiline': 'true'
        },
        handleKeyDown: (_view, event) => {
          // Handle Ctrl+Enter or Cmd+Enter for submit
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            onSubmit?.()
            return true
          }
          return false
        },
        clipboardTextSerializer(content) {
          return parseEditorJsonToText(content.toJSON())
        }
      },
      content: postEditorCache.getPostContentCache({ defaultContent, parentEvent }),
      onUpdate(props) {
        setText(parseEditorJsonToText(props.editor.getJSON()))
        postEditorCache.setPostContentCache({ defaultContent, parentEvent }, props.editor.getJSON())
      },
      onCreate(props) {
        setText(parseEditorJsonToText(props.editor.getJSON()))
      }
    })

    useImperativeHandle(ref, () => ({
      appendText: (text: string, addNewline = false) => {
        if (editor) {
          let chain = editor
            .chain()
            .focus()
            .command(({ tr, dispatch }) => {
              if (dispatch) {
                const endPos = tr.doc.content.size
                const selection = TextSelection.create(tr.doc, endPos)
                tr.setSelection(selection)
                dispatch(tr)
              }
              return true
            })
            .insertContent(text)
          if (addNewline) {
            chain = chain.setHardBreak()
          }
          chain.run()
        }
      },
      insertText: (text: string) => {
        if (editor) {
          editor.chain().focus().insertContent(text).run()
        }
      },
      insertEmoji: (emoji: string | TEmoji) => {
        if (editor) {
          if (typeof emoji === 'string') {
            editor.chain().insertContent(emoji).run()
          } else {
            const emojiNode = editor.schema.nodes.emoji.create({
              name: customEmojiService.getEmojiId(emoji)
            })
            editor.chain().insertContent(emojiNode).insertContent(' ').run()
          }
        }
      },
      insertMention: (userId: string, position: 'start' | 'end' = 'end') => {
        if (editor) {
          let chain = editor.chain().focus()
          if (position === 'start') {
            chain = chain.command(({ tr, dispatch }) => {
              if (dispatch) {
                const selection = TextSelection.create(tr.doc, 1)
                tr.setSelection(selection)
                dispatch(tr)
              }
              return true
            })
          }
          chain.createMention(userId).run()
        }
      },
      replaceContent: (content: Content) => {
        if (!editor) return
        editor.commands.setContent(content)
        window.requestAnimationFrame(() => {
          if (!editor.isDestroyed) {
            editor.chain().focus('end').run()
          }
        })
      }
    }))

    const previewContent = useMemo(() => {
      // Combine text with image URLs for preview
      let content = text.trim()
      if (images.length > 0) {
        const imageUrls = images.map((img) => img.url).join('\n')
        content = content ? `${content}\n${imageUrls}` : imageUrls
      }
      return content
    }, [text, images])

    useEffect(() => {
      if (!editor) {
        return
      }

      const timerId = window.setTimeout(() => {
        if (!editor.isDestroyed) {
          editor.chain().focus('end').run()
        }
      }, isMobileComposer ? 80 : 40)

      return () => window.clearTimeout(timerId)
    }, [editor, isMobileComposer])

    const showDraftTab = !!onSelectLocalDraft && !!onDeleteLocalDraft && !parentEvent
    const draftTriggerLabel = t('Drafts', { defaultValue: 'Drafts' })

    const handleSelectDraft = (draft: TLocalPostDraft) => {
      if (!editor) return

      editor.commands.setContent(draft.content as JSONContent | string)
      onSelectLocalDraft?.(draft)
      setTabValue('edit')

      window.requestAnimationFrame(() => {
        if (!editor.isDestroyed) {
          editor.chain().focus('end').run()
        }
      })
    }

    if (!editor) {
      return null
    }

    return (
      <div className="space-y-2">
        <Tabs defaultValue="edit" value={tabValue} onValueChange={(v) => setTabValue(v)}>
          <TabsList
            className={cn(
              isMobileComposer &&
                `grid h-auto w-full ${showDraftTab ? 'grid-cols-3' : 'grid-cols-2'}`
            )}
          >
            <TabsTrigger value="edit">{t('Edit')}</TabsTrigger>
            <TabsTrigger value="preview">{t('Preview')}</TabsTrigger>
            {showDraftTab ? (
              <TabsTrigger value="drafts" className="gap-2">
                <span>{draftTriggerLabel}</span>
                <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[11px] leading-none">
                  {localDrafts.length}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="edit" className="mt-2">
            <div className="space-y-3">
              <EditorContent className="tiptap" editor={editor} />
              {onRemoveImage && onUpdateImageAlt && (
                <ImagePreview
                  images={images}
                  onRemove={onRemoveImage}
                  onUpdateAlt={onUpdateImageAlt}
                  mode={isMobileComposer ? 'mobile' : 'default'}
                  hideAltControls={isMobileComposer}
                />
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="preview"
            className="mt-2"
            onClick={() => {
              setTabValue('edit')
              editor.commands.focus()
            }}
          >
            <Preview content={previewContent} images={images} className={className} />
          </TabsContent>
          {showDraftTab ? (
            <TabsContent value="drafts" className="mt-2">
              <LocalDrafts
                drafts={localDrafts}
                activeDraftId={activeLocalDraftId}
                onSelectDraft={handleSelectDraft}
                onDeleteDraft={(draftId) => {
                  onDeleteLocalDraft?.(draftId)
                }}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    )
  }
)
PostTextarea.displayName = 'PostTextarea'
export default PostTextarea
