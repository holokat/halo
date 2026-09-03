import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { normalizePollCreateData } from '@/lib/poll'
import { parseEditorJsonToText } from '@/lib/tiptap'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import storage from '@/services/local-storage.service'
import postEditorCache from '@/services/post-editor-cache.service'
import postEditor from '@/services/post-editor.service'
import { Event } from 'nostr-tools'
import { Dispatch, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PostContent from './PostContent'
import Title from './Title'

export default function PostEditor({
  defaultContent = '',
  initialMentionIds = [],
  parentEvent,
  open,
  setOpen,
  openFrom
}: {
  defaultContent?: string
  initialMentionIds?: string[]
  parentEvent?: Event
  open: boolean
  setOpen: Dispatch<boolean>
  openFrom?: string[]
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { account, pubkey } = useNostr()
  const [isProtectedEvent, setIsProtectedEvent] = useState(false)
  const [additionalRelayUrls, setAdditionalRelayUrls] = useState<string[]>([])
  const draftOwnerPubkey = account?.pubkey ?? pubkey ?? null

  const handleClose = useCallback(
    ({ saveLocalDraft = true }: { saveLocalDraft?: boolean } = {}) => {
      if (!saveLocalDraft || parentEvent) {
        setOpen(false)
        return
      }

      const rawContent = postEditorCache.getPostContentCache({ defaultContent, parentEvent })
      const settings = postEditorCache.getPostSettingsCache({ defaultContent, parentEvent })
      const content = Array.isArray(rawContent) ? { type: 'doc', content: rawContent } : rawContent ?? ''
      const previewText =
        typeof content === 'string' ? content.trim() : parseEditorJsonToText(content).trim()
      const defaultText = defaultContent.trim()
      const hasPollContent =
        !!settings?.isPoll &&
        normalizePollCreateData(settings.pollCreateData).options.some(
          (option) => option.label.trim() || option.image
        )
      const hasMeaningfulDraft =
        (previewText.length > 0 && previewText !== defaultText) ||
        (settings?.images?.length ?? 0) > 0 ||
        hasPollContent

      if (!hasMeaningfulDraft) {
        postEditorCache.clearPostCache({ defaultContent, parentEvent })
        setOpen(false)
        return
      }

      if (!draftOwnerPubkey) {
        setOpen(false)
        return
      }

      storage.saveLocalPostDraft(
        {
          id: settings?.activeLocalDraftId ?? undefined,
          content,
          previewText,
          images: settings?.images ?? [],
          isNsfw: settings?.isNsfw ?? false,
          isPoll: settings?.isPoll ?? false,
          pollCreateData: normalizePollCreateData(settings?.pollCreateData),
          addClientTag: settings?.addClientTag ?? true,
          scheduledFor: settings?.scheduledFor ?? null,
          minPow: settings?.minPow ?? 0
        },
        draftOwnerPubkey
      )

      postEditorCache.clearPostCache({ defaultContent, parentEvent })
      toast.success(t('Saved to drafts', { defaultValue: 'Saved to drafts' }))
      setOpen(false)
    },
    [defaultContent, draftOwnerPubkey, parentEvent, setOpen, t]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true)
        return
      }

      handleClose()
    },
    [handleClose, setOpen]
  )

  const content = useMemo(() => {
    return (
      <PostContent
        defaultContent={defaultContent}
        initialMentionIds={initialMentionIds}
        parentEvent={parentEvent}
        close={handleClose}
        openFrom={openFrom}
        isMobileComposer={isSmallScreen}
        isProtectedEvent={isProtectedEvent}
        additionalRelayUrls={additionalRelayUrls}
        setIsProtectedEvent={setIsProtectedEvent}
        setAdditionalRelayUrls={setAdditionalRelayUrls}
      />
    )
  }, [
    defaultContent,
    initialMentionIds,
    parentEvent,
    openFrom,
    isSmallScreen,
    handleClose,
    isProtectedEvent,
    additionalRelayUrls
  ])

  if (isSmallScreen) {
    return (
      <Drawer
        open={open}
        onOpenChange={handleOpenChange}
        shouldScaleBackground={false}
        // Keep the composer header stable when the virtual keyboard opens.
        repositionInputs={false}
      >
        <DrawerContent
          className="bg-background flex flex-col p-0"
          fullHeight
          onEscapeKeyDown={(e) => {
            if (postEditor.isSuggestionPopupOpen) {
              e.preventDefault()
              postEditor.closeSuggestionPopup()
            }
          }}
        >
          <DrawerTitle id="post-editor-title" className="sr-only">
            Post editor
          </DrawerTitle>
          <DrawerDescription className="hidden" />
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl border-0 bg-card p-0 shadow-[0_28px_80px_rgba(0,0,0,0.42),0_8px_24px_rgba(0,0,0,0.24)] sm:border-0"
        style={{
          backgroundColor:
            'color-mix(in srgb, hsl(var(--background)) 90%, hsl(var(--foreground)) 10%)'
        }}
        withoutClose
        onEscapeKeyDown={(e) => {
          if (postEditor.isSuggestionPopupOpen) {
            e.preventDefault()
            postEditor.closeSuggestionPopup()
          }
        }}
        aria-labelledby="post-editor-title"
      >
        <ScrollArea className="px-4 h-full max-h-screen">
          <div className="space-y-4 px-2 py-6">
            <DialogHeader>
              <DialogTitle id="post-editor-title">
                <Title
                  parentEvent={parentEvent}
                  openFrom={openFrom}
                  setIsProtectedEvent={setIsProtectedEvent}
                  setAdditionalRelayUrls={setAdditionalRelayUrls}
                />
              </DialogTitle>
              <DialogDescription className="hidden" />
            </DialogHeader>
            {content}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
