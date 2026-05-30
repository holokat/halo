import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { ComponentProps, MouseEventHandler } from 'react'

export default function BottomNavigationBarItem({
  children,
  active = false,
  onClick,
  className,
  ...props
}: {
  children: React.ReactNode
  active?: boolean
  onClick: MouseEventHandler
  className?: string
} & Omit<ComponentProps<typeof Button>, 'children' | 'onClick' | 'className'>) {
  return (
    <Button
      className={cn(
        'flex shadow-none items-center bg-transparent w-full h-12 p-3 m-0 rounded-lg [&_svg]:size-5 text-muted-foreground hover:text-muted-foreground/80',
        active && 'text-foreground hover:text-foreground',
        className
      )}
      variant="ghost"
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}
