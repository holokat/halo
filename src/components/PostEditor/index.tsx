import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import postEditor from '@/services/post-editor.service'
import { Event } from 'nostr-tools'
import { Dispatch, useMemo, useState } from 'react'
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
  const { isSmallScreen } = useScreenSize()
  const [isProtectedEvent, setIsProtectedEvent] = useState(false)
  const [additionalRelayUrls, setAdditionalRelayUrls] = useState<string[]>([])

  const content = useMemo(() => {
    return (
      <PostContent
        defaultContent={defaultContent}
        initialMentionIds={initialMentionIds}
        parentEvent={parentEvent}
        close={() => setOpen(false)}
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
    isProtectedEvent,
    additionalRelayUrls
  ])

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 max-w-2xl bg-card"
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
