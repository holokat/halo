// import { useTheme } from "next-themes"
import { useTheme } from '@/providers/ThemeProvider'
import { IconCheckmark1 } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconCheckmark1'
import { IconCircleInfo } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconCircleInfo'
import { IconCircleX } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconCircleX'
import { IconExclamationTriangle } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconExclamationTriangle'
import { IconLoadingCircle } from '@central-icons-react/round-filled-radius-2-stroke-1.5/IconLoadingCircle'
import { IconCrossLarge } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCrossLarge'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // const { theme = "system" } = useTheme()
  const { themeSetting } = useTheme()

  return (
    <Sonner
      theme={themeSetting}
      className="toaster group"
      richColors
      mobileOffset={64}
      icons={{
        success: <IconCheckmark1 size={16} aria-hidden="true" />,
        info: <IconCircleInfo size={16} aria-hidden="true" />,
        warning: <IconExclamationTriangle size={16} aria-hidden="true" />,
        error: <IconCircleX size={16} aria-hidden="true" />,
        loading: <IconLoadingCircle className="animate-spin" size={16} aria-hidden="true" />,
        close: <IconCrossLarge size={16} aria-hidden="true" />
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
