import { Card } from '@/components/ui/card'
import { transformCustomEmojisInContent } from '@/lib/draft-event'
import { createFakeEvent } from '@/lib/event'
import { cn } from '@/lib/utils'
import type { ImageAttachment } from '@/services/post-editor-cache.service'
import { useMemo } from 'react'
import Content from '../../Content'
import { buildImageAttachmentImetaTag } from '../post-content/submission'

export default function Preview({
  content,
  className,
  images = []
}: {
  content: string
  className?: string
  images?: ImageAttachment[]
}) {
  const { content: processedContent, emojiTags } = useMemo(
    () => transformCustomEmojisInContent(content),
    [content]
  )

  // Create imeta tags for images
  const imetaTags = useMemo(() => {
    return images.map(buildImageAttachmentImetaTag)
  }, [images])

  const allTags = useMemo(() => [...emojiTags, ...imetaTags], [emojiTags, imetaTags])

  return (
    <Card className={cn('p-3', className)}>
      <Content
        event={createFakeEvent({ content: processedContent, tags: allTags })}
        className="pointer-events-none h-full"
        mustLoadMedia
      />
    </Card>
  )
}
