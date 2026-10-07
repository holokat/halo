import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconArrowRotateLeftRight as RefreshCcw } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconArrowRotateLeftRight'
import { useState } from 'react'

export function RefreshButton({ onClick }: { onClick: () => void }) {
  const [refreshing, setRefreshing] = useState(false)

  return (
    <Button
      variant="ghost"
      size="titlebar-icon"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true)
        onClick()
        setTimeout(() => setRefreshing(false), 500)
      }}
      className="focus:text-foreground [&_svg]:size-4"
    >
      <RefreshCcw className={cn(refreshing ? 'animate-spin' : '')} />
    </Button>
  )
}
