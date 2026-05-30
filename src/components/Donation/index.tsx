import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import PlatinumSponsors from './PlatinumSponsors'

export default function Donation({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <div className={cn('p-4 border rounded-lg space-y-4', className)}>
      <div className="text-center font-semibold">{t('Enjoying Jumble?')}</div>
      <div className="text-center text-muted-foreground">
        {t('Your donation helps me maintain Jumble and make it better! 😊')}
      </div>
      <PlatinumSponsors />
    </div>
  )
}
