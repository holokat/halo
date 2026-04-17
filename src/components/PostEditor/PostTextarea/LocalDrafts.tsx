import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TLocalPostDraft } from '@/types'
import { Clock3, FileText, Image as ImageIcon, ListTodo, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function LocalDrafts({
  drafts,
  activeDraftId,
  onSelectDraft,
  onDeleteDraft
}: {
  drafts: TLocalPostDraft[]
  activeDraftId?: string | null
  onSelectDraft: (draft: TLocalPostDraft) => void
  onDeleteDraft: (draftId: string) => void
}) {
  const { t } = useTranslation()
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  )

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
          <FileText className="size-5" />
        </div>
        <div className="font-medium">{t('No drafts yet', { defaultValue: 'No drafts yet' })}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {t('Close a note before posting and it will appear here.', {
            defaultValue: 'Close a note before posting and it will appear here.'
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {drafts.map((draft) => {
        const hasText = draft.previewText.trim().length > 0
        const isActive = activeDraftId === draft.id
        const summary = hasText
          ? draft.previewText
          : draft.isPoll
            ? t('Poll draft', { defaultValue: 'Poll draft' })
            : draft.images.length > 0
              ? t('Media draft', { defaultValue: 'Media draft' })
              : t('Untitled draft', { defaultValue: 'Untitled draft' })

        return (
          <div
            key={draft.id}
            className={cn(
              'rounded-2xl border bg-card/60 p-3 transition-colors',
              isActive ? 'border-primary/50 bg-primary/5' : 'border-border/70'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-medium">{summary}</div>
                  {isActive ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('Loaded', { defaultValue: 'Loaded' })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3.5" />
                    {dateTimeFormatter.format(draft.updatedAt)}
                  </span>
                  {draft.images.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="size-3.5" />
                      {t('{{count}} images', {
                        count: draft.images.length,
                        defaultValue: '{{count}} images'
                      })}
                    </span>
                  ) : null}
                  {draft.isPoll ? (
                    <span className="inline-flex items-center gap-1">
                      <ListTodo className="size-3.5" />
                      {t('Poll', { defaultValue: 'Poll' })}
                    </span>
                  ) : null}
                </div>
                {hasText ? (
                  <div className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {draft.previewText}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={isActive ? 'secondary' : 'outline'}
                  onClick={() => onSelectDraft(draft)}
                >
                  {isActive
                    ? t('Use again', { defaultValue: 'Use again' })
                    : t('Use draft', { defaultValue: 'Use draft' })}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost-destructive"
                  aria-label={t('Delete draft', { defaultValue: 'Delete draft' })}
                  onClick={() => onDeleteDraft(draft.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
