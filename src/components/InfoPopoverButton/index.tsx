import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Info } from 'lucide-react'
import { ReactNode } from 'react'

export default function InfoPopoverButton({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-1 text-sm leading-5">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  )
}
