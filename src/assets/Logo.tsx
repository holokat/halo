import HaloMark from '@/components/HaloMark'
import { usePrimaryPage } from '@/PageManager'
import { cn } from '@/lib/utils'

export default function Logo({ className }: { className?: string }) {
  const { navigate } = usePrimaryPage()

  return (
    <button
      type="button"
      aria-label="Halo"
      className={cn(
        'flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-150 active:scale-[0.96]',
        className
      )}
      onClick={() => navigate('home')}
    >
      <HaloMark className="size-full" />
    </button>
  )
}
