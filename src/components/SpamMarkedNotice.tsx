import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSpamFilter } from '@/providers/SpamFilterProvider'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SpamMarkedNotice({
  pubkey,
  className
}: {
  pubkey: string
  className?: string
}) {
  const { t } = useTranslation()
  const { markNotSpam } = useSpamFilter()

  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground',
        className
      )}
      role="status"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <ShieldAlert className="size-4" aria-hidden="true" />
      </span>
      <span>
        {t('This user is marked as spam', { defaultValue: 'This user is marked as spam' })}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto min-h-10 shrink-0"
        onClick={() => markNotSpam(pubkey)}
      >
        {t('Not spam', { defaultValue: 'Not spam' })}
      </Button>
    </div>
  )
}
