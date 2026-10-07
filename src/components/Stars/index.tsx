import { IconStar as FilledStar } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconStar'
import { cn } from '@/lib/utils'
import { IconStar as Star } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconStar'
import { useMemo } from 'react'

export default function Stars({ stars, className }: { stars: number; className?: string }) {
  const roundedStars = useMemo(() => Math.round(stars), [stars])

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {Array.from({ length: 5 }).map((_, index) =>
        index < roundedStars ? (
          <FilledStar key={index} className="size-4 text-foreground" />
        ) : (
          <Star key={index} className="size-4 text-muted-foreground" />
        )
      )}
    </div>
  )
}
