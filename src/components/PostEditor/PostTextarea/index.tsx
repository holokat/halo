import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseEditorJsonToText } from '@/lib/tiptap'
import { cn } from '@/lib/utils'
import customEmojiService from '@/services/custom-emoji.service'
import postEditorCache from '@/services/post-editor-cache.service'
import { TEmoji } from '@/types'
import Document from '@tiptap/extension-document'
import { HardBreak } from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/react'
import { Event } from 'nostr-tools'
import { Dispatch, forwardRef, SetStateAction, useImperativeHandle, useMemo, useState } from 'react'
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

export type TPostTextareaHandle = {
  appendText: (text: string, addNewline?: boolean) => void
  insertText: (text: string) => void
  insertEmoji: (emoji: string | TEmoji) => void
  insertMention: (userId: string, position?: 'start' | 'end') => void
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
      onUpdateImageAlt
    },
    ref
  ) => {
    const { t } = useTranslation()
    const [tabValue, setTabValue] = useState('edit')
    const composerPlaceholder = placeholder ?? t('Enter text, paste or upload media')
    const editorClassName = cn(
      isMobileComposer
        ? 'rounded-none border-0 bg-transparent p-0 text-[16px] leading-6 focus-visible:outline-none focus-visible:ring-0'
        : 'rounded-lg border p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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

    if (!editor) {
      return null
    }

    if (isMobileComposer) {
      return (
        <div className="space-y-3">
          <EditorContent className="tiptap" editor={editor} />
          {onRemoveImage && onUpdateImageAlt && (
            <ImagePreview
              images={images}
              onRemove={onRemoveImage}
              onUpdateAlt={onUpdateImageAlt}
              mode="mobile"
              hideAltControls
            />
          )}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <Tabs defaultValue="edit" value={tabValue} onValueChange={(v) => setTabValue(v)}>
          <TabsList>
            <TabsTrigger value="edit">{t('Edit')}</TabsTrigger>
            <TabsTrigger value="preview">{t('Preview')}</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="mt-2">
            <EditorContent className="tiptap" editor={editor} />
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
        </Tabs>
        {tabValue === 'edit' && onRemoveImage && onUpdateImageAlt && (
          <ImagePreview
            images={images}
            onRemove={onRemoveImage}
            onUpdateAlt={onUpdateImageAlt}
            mode="default"
          />
        )}
      </div>
    )
  }
)
PostTextarea.displayName = 'PostTextarea'
export default PostTextarea
