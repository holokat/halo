import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

const SettingsListItem = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode
    label: string
    description?: string
    trailing?: ReactNode
  }
>(({ icon, label, description, trailing, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {trailing ?? <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  )
})

SettingsListItem.displayName = 'SettingsListItem'

export default SettingsListItem
