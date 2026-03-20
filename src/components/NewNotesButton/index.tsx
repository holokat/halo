import { Button } from '@/components/ui/button'
import { SimpleUserAvatar } from '@/components/UserAvatar'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { ArrowUp } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'

export default function NewNotesButton({
  newEvents = [],
  onClick
}: {
  newEvents?: Event[]
  onClick?: () => void
}) {
  const { isSmallScreen } = useScreenSize()
  const newNotesLabel = 'posted'
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
            top: isSmallScreen
              ? 'calc(3.5rem + env(safe-area-inset-top))'
              : '3.5rem'
          }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Button
            onClick={onClick}
            className="group rounded-full h-fit py-2 pl-2 pr-3 hover:bg-primary-hover pointer-events-auto"
            aria-label={newNotesLabel}
          >
            {pubkeys.length > 0 && (
              <div className="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale" aria-hidden="true">
                {pubkeys.map((pubkey) => (
                  <SimpleUserAvatar key={pubkey} userId={pubkey} size="small" />
                ))}
              </div>
            )}
            <div className="text-md font-medium">
              {newNotesLabel}
            </div>
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      )}
    </>
  )
}
