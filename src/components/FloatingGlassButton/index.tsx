import { cn } from '@/lib/utils'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

const FloatingGlassButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }
>(({ className, children, type = 'button', ...props }, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'relative isolate inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background/75 text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.20)] backdrop-blur-[16px] transition-[transform,background-color,box-shadow] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-gradient-to-b before:from-white/[0.14] before:via-white/[0.03] before:to-black/[0.06] hover:bg-background/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] supports-[backdrop-filter]:bg-background/55 motion-reduce:transition-none dark:bg-white/[0.10] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.24),0_8px_24px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] dark:hover:bg-white/[0.14] dark:supports-[backdrop-filter]:bg-white/[0.10] [&_svg]:relative [&_svg]:z-10 [&_svg]:size-5 [&_svg]:shrink-0',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})

FloatingGlassButton.displayName = 'FloatingGlassButton'

export default FloatingGlassButton
