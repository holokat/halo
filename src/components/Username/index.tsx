import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { useFetchProfile } from '@/hooks'
import { toProfile } from '@/lib/link'
import { formatPubkey, isValidPubkey, userIdToPubkey } from '@/lib/pubkey'
import { cn } from '@/lib/utils'
import { SecondaryPageLink } from '@/PageManager'
import ProfileCard from '../ProfileCard'

export default function Username({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false,
  noLink = false,
  asHeading = false,
  headingLevel = 3
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
  noLink?: boolean
  asHeading?: boolean
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
}) {
  const { profile } = useFetchProfile(userId)
  if (!profile && withoutSkeleton) return null

  const rawPubkey = profile?.pubkey ?? userIdToPubkey(userId)
  const hasValidPubkey = isValidPubkey(rawPubkey)
  const pubkey = hasValidPubkey ? rawPubkey : undefined
  const username = profile?.username ?? formatPubkey(rawPubkey)
  const fallbackClassName = !profile ? 'text-muted-foreground' : ''
  const HeadingTag = asHeading ? (`h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') : 'div'

  if (!pubkey) {
    return (
      <HeadingTag className={cn(className, fallbackClassName)}>
        {showAt && '@'}
        {username}
      </HeadingTag>
    )
  }

  if (noLink) {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <HeadingTag className={cn(className, fallbackClassName)}>
            <span className="truncate">
              {showAt && '@'}
              {username}
            </span>
          </HeadingTag>
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          <ProfileCard pubkey={pubkey} />
        </HoverCardContent>
      </HoverCard>
    )
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <HeadingTag className={cn(className, fallbackClassName)}>
          <SecondaryPageLink
            to={toProfile(pubkey)}
            className="truncate hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {showAt && '@'}
            {username}
          </SecondaryPageLink>
        </HeadingTag>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <ProfileCard pubkey={pubkey} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function SimpleUsername({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
}) {
  const { profile } = useFetchProfile(userId)
  if (!profile && withoutSkeleton) return null

  const rawPubkey = profile?.pubkey ?? userIdToPubkey(userId)
  const username = profile?.username ?? formatPubkey(rawPubkey)

  return (
    <div className={className}>
      {showAt && '@'}
      {username}
    </div>
  )
}
