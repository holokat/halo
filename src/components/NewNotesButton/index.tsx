import { SimpleUserAvatar } from '@/components/UserAvatar'
import { floatingGlassBackdropStyle, floatingGlassSurfaceClassName } from '@/lib/floating-glass'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { IconArrowUp as ArrowUp } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconArrowUp'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function NewNotesButton({
  newEvents = [],
  onClick
}: {
  newEvents?: Event[]
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const newNotesLabel = t('Show n new notes', { n: newEvents.length })
  const pubkeys = useMemo(() => {
    const arr: string[] = []
    for (const event of newEvents) {
      if (!arr.includes(event.pubkey)) {
        arr.push(event.pubkey)
      }
      if (arr.length >= 3) break
    }
    return arr
  }, [newEvents])

  return (
    <>
      {newEvents.length > 0 && (
        <div
          className={cn(
            'w-full flex justify-center z-40 pointer-events-none',
            isSmallScreen ? 'fixed' : 'absolute'
          )}
          style={{
            top: isSmallScreen ? 'calc(3.5rem + env(safe-area-inset-top))' : '3.5rem'
          }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <button
            type="button"
            onClick={onClick}
            className={cn(
              floatingGlassSurfaceClassName,
              'pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-foreground transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-background/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] motion-reduce:transition-none dark:hover:bg-white/[0.14]'
            )}
            style={floatingGlassBackdropStyle}
            aria-label={newNotesLabel}
          >
            {pubkeys.length > 0 && (
              <div
                className="relative z-10 flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:grayscale"
                aria-hidden="true"
              >
                {pubkeys.map((pubkey) => (
                  <SimpleUserAvatar key={pubkey} userId={pubkey} size="small" />
                ))}
              </div>
            )}
            <ArrowUp className="relative z-10 size-3 shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}
