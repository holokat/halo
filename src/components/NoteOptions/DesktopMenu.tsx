import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import useDeferredAction from '@/hooks/useDeferredAction'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { MenuAction } from './useMenuActions'

interface DesktopMenuProps {
  menuActions: MenuAction[]
  trigger: React.ReactNode
}

export function DesktopMenu({ menuActions, trigger }: DesktopMenuProps) {
  const [open, setOpen] = useState(false)
  const deferAction = useDeferredAction()

  const runMenuAction = (action?: () => void) => {
    if (!action) return
    setOpen(false)
    deferAction(action)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[50vh] overflow-y-auto">
        {menuActions.map((action, index) => {
          const Icon = action.icon
          return (
            <div key={index}>
              {action.separator && index > 0 && <DropdownMenuSeparator />}
              {action.subMenu ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={action.className}>
                    <Icon />
                    {action.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-[50vh] overflow-y-auto"
                    showScrollButtons
                  >
                    {action.subMenu.map((subAction, subIndex) => (
                      <div key={subIndex}>
                        {subAction.separator && subIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            runMenuAction(subAction.onClick)
                          }}
                          className={cn('w-64', subAction.className)}
                        >
                          {subAction.label}
                        </DropdownMenuItem>
                      </div>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    runMenuAction(action.onClick)
                  }}
                  className={action.className}
                >
                  <Icon />
                  {action.label}
                </DropdownMenuItem>
              )}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
