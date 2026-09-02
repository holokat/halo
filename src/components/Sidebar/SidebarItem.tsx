import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const SidebarItem = forwardRef<
  HTMLButtonElement,
  ButtonProps & { title: string; description?: string; active?: boolean }
>(({ children, title, description, className, active, 'aria-label': ariaLabel, ...props }, ref) => {
  const label = description ?? title

  const button = (
    <Button
      className={cn(
        'm-0 flex h-12 w-12 items-center gap-4 rounded-xl bg-transparent p-3 font-medium shadow-none transition-colors [&_svg]:size-5 [&_svg]:stroke-[1.8]',
        'xl:h-11 xl:w-full xl:justify-start xl:px-3',
        !active && 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
        className
      )}
      style={{ fontSize: 'var(--font-size, 14px)' }}
      variant="ghost"
      title={label}
      aria-label={ariaLabel || label}
      aria-current={active ? 'page' : undefined}
      ref={ref}
      {...props}
    >
      <span aria-hidden="true" className="shrink-0">
        {children}
      </span>
      <span className="hidden truncate xl:block">{label}</span>
    </Button>
  )

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-sm font-medium xl:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
})

SidebarItem.displayName = 'SidebarItem'

export default SidebarItem
