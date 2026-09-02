import { type TPinnedColumn } from '@/types'

type PinButtonProps = {
  column: Omit<TPinnedColumn, 'id'>
  className?: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'titlebar-icon'
}

export default function PinButton(_props: PinButtonProps) {
  return null
}
