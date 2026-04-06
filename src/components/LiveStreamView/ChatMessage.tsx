import Content from '@/components/Content'
import UserAvatar from '@/components/UserAvatar'
import Username from '@/components/Username'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import { useSecondaryPage } from '@/PageManager'
import { Event as NostrEvent, nip19 } from 'nostr-tools'

export function ChatMessage({
  event,
  isSmallScreen
}: {
  event: NostrEvent
  isSmallScreen: boolean
}) {
  const { push } = useSecondaryPage()

  return (
    <div className="group flex w-full min-w-0 gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/50">
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-pointer leading-none"
        onClick={() => push(`/users/${nip19.npubEncode(event.pubkey)}`)}
      >
        <UserAvatar userId={event.pubkey} size="xSmall" noLink />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <button
            type="button"
            className="min-w-0 max-w-full cursor-pointer truncate text-xs font-semibold leading-tight hover:underline"
            onClick={() => push(`/users/${nip19.npubEncode(event.pubkey)}`)}
          >
            <Username userId={event.pubkey} noLink className="truncate" />
          </button>
          <FormattedTimestamp
            timestamp={event.created_at}
            className="text-xs text-muted-foreground"
            short={isSmallScreen}
          />
        </div>
        <Content content={event.content} className="mt-0.5 overflow-hidden text-xs leading-snug" />
      </div>
    </div>
  )
}
