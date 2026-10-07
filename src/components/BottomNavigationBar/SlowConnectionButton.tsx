import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import { IconGauge as Gauge } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconGauge'
import { useTranslation } from 'react-i18next'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function SlowConnectionButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { lowBandwidthMode, setLowBandwidthMode } = useLowBandwidthMode()
  const stateLabel = lowBandwidthMode ? t('enabled') : t('disabled')

  return (
    <BottomNavigationBarItem
      active={lowBandwidthMode}
      className={className}
      onClick={() => setLowBandwidthMode(!lowBandwidthMode)}
      title={t('Slow Connection Mode')}
      aria-label={`${t('Slow Connection Mode')}, ${stateLabel}`}
      aria-pressed={lowBandwidthMode}
    >
      <Gauge />
    </BottomNavigationBarItem>
  )
}
