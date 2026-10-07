import { cn } from '@/lib/utils'
import { IconArrowsRepeat as Repeat2 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconArrowsRepeat'
import { useTranslation } from 'react-i18next'
import Username from '../Username'

export default function RepostDescription({
  reposter,
  className
}: {
  reposter?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  if (!reposter) return null

  return (
    <div className={cn('flex gap-1 text-sm items-center text-muted-foreground mb-1', className)}>
      <Repeat2 size={16} className="shrink-0" />
      <Username userId={reposter} className="font-semibold truncate" skeletonClassName="h-3" />
      <div className="shrink-0">{t('reposted')}</div>
    </div>
  )
}
