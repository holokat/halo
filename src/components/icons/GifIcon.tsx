import { cn } from '@/lib/utils'

export default function GifIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded-[4px] border border-current/35 px-1 text-[9px] font-bold leading-none tracking-[0.04em]',
        className
      )}
      aria-hidden="true"
    >
      GIF
    </span>
  )
}

