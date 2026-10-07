import { IconArrowDown } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconArrowDown'
import { IconLoadingCircle } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconLoadingCircle'
import { useTranslation } from 'react-i18next'

export function PullToRefreshIndicator({ loading = true }: { loading?: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
      {loading ? (
        <>
          <IconLoadingCircle className="size-6 animate-spin" />
          <span className="sr-only">{t('Loading')}</span>
        </>
      ) : (
        <>
          <IconArrowDown className="size-5" />
          <span>{t('Pull to refresh')}</span>
        </>
      )}
    </div>
  )
}
