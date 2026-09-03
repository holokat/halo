import { cn } from '@/lib/utils'
import { TImetaInfo } from '@/types'
import { Eye } from 'lucide-react'
import { CSSProperties, MouseEventHandler } from 'react'
import Image from '../Image'

export default function ObscuredImagePreview({
  image,
  label,
  compact = false,
  className,
  style,
  onView
}: {
  image: TImetaInfo
  label: string
  compact?: boolean
  className?: string
  style?: CSSProperties
  onView: MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <div
      className={cn(
        'group relative isolate overflow-hidden bg-muted outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10',
        className
      )}
      style={{ borderRadius: 'var(--media-radius, 12px)', ...style }}
    >
      <Image
        aria-hidden="true"
        image={image}
        className="pointer-events-none select-none object-cover"
        classNames={{
          wrapper:
            'pointer-events-none absolute -inset-4 scale-[1.08] blur-xl saturate-[0.82] transition-[transform,filter] duration-300 ease-out group-hover:scale-[1.10]'
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/10 via-black/[0.08] to-black/20 dark:from-white/[0.04] dark:via-black/[0.08] dark:to-black/25"
      />

      <button
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          'absolute left-1/2 top-1/2 z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-black shadow-[0_0_0_1px_rgba(255,255,255,0.42),0_1px_2px_rgba(0,0,0,0.16),0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-white/85 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.55),0_2px_4px_rgba(0,0,0,0.16),0_10px_28px_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 active:scale-[0.96] dark:bg-white/[0.14] dark:text-white dark:shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.32),0_8px_24px_rgba(0,0,0,0.30)] dark:hover:bg-white/[0.22]',
          compact
            ? "size-9 after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
            : 'size-10'
        )}
        onClick={onView}
      >
        <Eye aria-hidden="true" className={compact ? 'size-4' : 'h-[18px] w-[18px]'} />
      </button>
    </div>
  )
}
