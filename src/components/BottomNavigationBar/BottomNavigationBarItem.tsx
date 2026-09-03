import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { ComponentProps, MouseEventHandler } from 'react'

export function bottomNavigationItemClassName(active = false) {
  return cn(
    'mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-muted-foreground shadow-none transition-[color,background-color,transform] duration-150 active:scale-[0.96] [&_svg]:size-[1.375rem]',
    'hover:bg-foreground/[0.06] hover:text-foreground',
    active && 'bg-foreground/[0.09] text-foreground hover:bg-foreground/[0.09]'
  )
}

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
      className={cn(bottomNavigationItemClassName(active), className)}
      variant="ghost"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      {...props}
    >
      {children}
    </Button>
  )
}
