import Note from '@/components/Note'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImageAttachment } from '@/services/post-editor-cache.service'
import { TPollCreateData } from '@/types'
import { Clock, X } from 'lucide-react'
import { Dispatch, SetStateAction } from 'react'
import { Event } from 'nostr-tools'
import PollEditor from '../PollEditor'

type TTranslate = (key: string, options?: Record<string, unknown>) => string

export function ParentEventPreview({ parentEvent }: { parentEvent?: Event }) {
  if (!parentEvent) {
    return null
  }

  return (
    <ScrollArea className="flex max-h-48 max-w-full flex-col overflow-x-hidden overflow-y-auto rounded-lg border bg-muted/40">
      <div className="pointer-events-none min-w-0 max-w-full overflow-x-hidden p-2 sm:p-3">
        <Note
          className="min-w-0 max-w-full overflow-x-hidden"
          size="small"
          event={parentEvent}
          hideParentNotePreview
          filterMutedNotes={false}
        />
      </div>
    </ScrollArea>
  )
}

export function UploadProgressList({
  onCancelUpload,
  t,
  uploadProgresses
}: {
  onCancelUpload: (file: File, cancel?: () => void) => void
  t: TTranslate
  uploadProgresses: { file: File; progress: number; cancel: () => void }[]
}) {
  if (uploadProgresses.length === 0) {
    return null
  }

  return (
    <>
      {uploadProgresses.map(({ file, progress, cancel }, index) => (
        <div key={`${file.name}-${index}`} className="mt-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 truncate text-xs text-muted-foreground">
              {file.name ?? t('Uploading...')}
            </div>
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCancelUpload(file, cancel)}
            className="text-muted-foreground hover:text-foreground"
            title={t('Cancel')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </>
  )
}

export function ScheduledBanner({
  formatScheduledDateTime,
  onClear,
  scheduledFor,
  t
}: {
  formatScheduledDateTime: (timestamp: number) => string
  onClear: () => void
  scheduledFor: number | null
  t: TTranslate
}) {
  if (!scheduledFor) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">
          {t('Scheduled for {{time}}', {
            time: formatScheduledDateTime(scheduledFor)
          })}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        {t('Clear')}
      </Button>
    </div>
  )
}

export function PrivateKeyWarningBanner({
  hasDetectedPrivateKey,
  t
}: {
  hasDetectedPrivateKey: boolean
  t: TTranslate
}) {
  if (!hasDetectedPrivateKey) {
    return null
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <p className="font-medium">
        {t('Private key detected. Posting is blocked for your safety.', {
          defaultValue: 'Private key detected. Posting is blocked for your safety.'
        })}
      </p>
      <p className="mt-1 text-destructive/90">
        {t('Remove any nsec value from this note, then post again.', {
          defaultValue: 'Remove any nsec value from this note, then post again.'
        })}
      </p>
    </div>
  )
}

export function PollEditorDrawer({
  onOpenChange,
  pollCreateData,
  pollEditorOpen,
  setIsPoll,
  setPollCreateData,
  t
}: {
  onOpenChange: (nextOpen: boolean) => void
  pollCreateData: TPollCreateData
  pollEditorOpen: boolean
  setIsPoll: Dispatch<SetStateAction<boolean>>
  setPollCreateData: Dispatch<SetStateAction<TPollCreateData>>
  t: TTranslate
}) {
  return (
    <Drawer open={pollEditorOpen} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[85dvh] bg-background">
        <DrawerTitle className="px-4 text-base">{t('Create Poll')}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t('Configure poll options and end date')}
        </DrawerDescription>
        <div className="space-y-3 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-1">
          <PollEditor
            pollCreateData={pollCreateData}
            setPollCreateData={setPollCreateData}
            setIsPoll={setIsPoll}
            onRemovePoll={() => onOpenChange(false)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
