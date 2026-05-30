import {
  EmbeddedEmojiParser,
  EmbeddedEventParser,
  EmbeddedHashtagParser,
  EmbeddedMentionParser,
  EmbeddedStockSymbolParser,
  EmbeddedUrlParser,
  EmbeddedWebsocketUrlParser,
  normalizeParsedContentNodes,
  parseContent
} from '@/lib/content-parser'
import { getImetaInfosFromEvent } from '@/lib/event'
import { encodeQuoteReference, getRenderableQuoteReferences } from '@/lib/event-references'
import { getEmojiInfosFromEmojiTags, getImetaInfoFromImetaTag } from '@/lib/tag'
import { cn } from '@/lib/utils'
import mediaUpload from '@/services/media-upload.service'
import { TImetaInfo } from '@/types'
import { Event } from 'nostr-tools'
import { useMemo, useState } from 'react'
import {
  EmbeddedHashtag,
  EmbeddedMention,
  EmbeddedNormalUrl,
  EmbeddedNote,
  EmbeddedStockSymbol,
  EmbeddedWebsocketUrl
} from '../Embedded'
import Emoji from '../Emoji'
import ImageGallery from '../ImageGallery'
import MediaPlayer from '../MediaPlayer'
import RelayPreview from '../RelayPreview'
import WebPreview from '../WebPreview'
import YoutubeEmbeddedPlayer from '../YoutubeEmbeddedPlayer'
import { useTextOnlyMode } from '@/providers/TextOnlyModeProvider'
import { useTranslation } from 'react-i18next'

export default function Content({
  event,
  content,
  className,
  mustLoadMedia,
  compactMedia = false
}: {
  event?: Event
  content?: string
  className?: string
  mustLoadMedia?: boolean
  compactMedia?: boolean
}) {
  const { textOnlyMode } = useTextOnlyMode()
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set())
  const { t } = useTranslation()

  const handleLoadMedia = (url: string) => {
    setLoadedMedia((prev) => new Set(prev).add(url))
  }

  const {
    nodes,
    allImages,
    mediaInfoByUrl,
    lastNormalUrl,
    relayUrls,
    emojiInfos,
    totalMediaCount,
    fallbackQuotes
  } = useMemo(() => {
    const _content = event?.content ?? content ?? ''

    const imetaInfos = event ? getImetaInfosFromEvent(event) : []
    const imetaInfoMap = new Map(imetaInfos.map((info) => [info.url, info]))
    const parsedNodes = parseContent(_content, [
      EmbeddedUrlParser,
      EmbeddedWebsocketUrlParser,
      EmbeddedEventParser,
      EmbeddedMentionParser,
      EmbeddedStockSymbolParser,
      EmbeddedHashtagParser,
      EmbeddedEmojiParser
    ])
    const nodes = normalizeParsedContentNodes(
      parsedNodes.map((node) => {
        if (node.type !== 'url') return node

        const imetaInfo = imetaInfoMap.get(node.data)
        if (!imetaInfo?.mimeType) return node

        if (imetaInfo.mimeType.startsWith('image/')) {
          return { type: 'image', data: node.data }
        }

        if (imetaInfo.mimeType.startsWith('video/') || imetaInfo.mimeType.startsWith('audio/')) {
          return { type: 'media', data: node.data }
        }

        return node
      })
    )

    const allImages = nodes
      .map((node) => {
        if (node.type === 'image') {
          const imageInfo = imetaInfos.find((image) => image.url === node.data)
          if (imageInfo) {
            return imageInfo
          }
          const tag = mediaUpload.getImetaTagByUrl(node.data)
          return tag
            ? getImetaInfoFromImetaTag(tag, event?.pubkey)
            : { url: node.data, pubkey: event?.pubkey }
        }
        if (node.type === 'images') {
          const urls = Array.isArray(node.data) ? node.data : [node.data]
          return urls.map((url) => {
            const imageInfo = imetaInfos.find((image) => image.url === url)
            return imageInfo ?? { url, pubkey: event?.pubkey }
          })
        }
        return null
      })
      .filter(Boolean)
      .flat() as TImetaInfo[]

    const emojiInfos = getEmojiInfosFromEmojiTags(event?.tags)

    const lastNormalUrlNode = nodes.findLast((node) => node.type === 'url')
    const lastNormalUrl =
      typeof lastNormalUrlNode?.data === 'string' ? lastNormalUrlNode.data : undefined

    const relayUrls = nodes.reduce<string[]>((urls, node) => {
      if (node.type === 'websocket-url') {
        urls.push(node.data)
      }
      return urls
    }, [])

    const fallbackQuotes = event
      ? getRenderableQuoteReferences({
          content: _content,
          tags: event.tags
        }).map((ref) => encodeQuoteReference(ref))
      : []

    // Count total media items (images, videos, youtube)
    const totalMediaCount = nodes.reduce((count, node) => {
      if (node.type === 'image') return count + 1
      if (node.type === 'images') {
        return count + (Array.isArray(node.data) ? node.data.length : 1)
      }
      if (node.type === 'media' || node.type === 'youtube') return count + 1
      return count
    }, 0)

    return {
      nodes,
      allImages,
      mediaInfoByUrl: imetaInfoMap,
      emojiInfos,
      lastNormalUrl,
      relayUrls,
      totalMediaCount,
      fallbackQuotes
    }
  }, [event, content])

  if ((!nodes || nodes.length === 0) && (!fallbackQuotes || fallbackQuotes.length === 0)) {
    return null
  }

  let imageIndex = 0
  return (
    <div
      className={cn(
        'min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]',
        className
      )}
    >
      {nodes.map((node, index) => {
        if (node.type === 'text') {
          return node.data
        }
        if (node.type === 'image' || node.type === 'images') {
          const start = imageIndex
          const end = imageIndex + (Array.isArray(node.data) ? node.data.length : 1)
          imageIndex = end

          if (textOnlyMode) {
            const urls = Array.isArray(node.data) ? node.data : [node.data]
            return urls.map((url, i) => {
              const isLoaded = loadedMedia.has(url)
              if (isLoaded) {
                const singleImageIndex = allImages.findIndex((img) => img.url === url)
                if (singleImageIndex >= 0) {
                  return (
                    <ImageGallery
                      className="mt-2"
                      key={`${index}-${i}`}
                      images={[allImages[singleImageIndex]]}
                      start={0}
                      end={1}
                      mustLoad
                      compactMedia={compactMedia}
                      isSingleMedia={totalMediaCount <= 2}
                    />
                  )
                }
              }
              return (
                <HiddenMediaChip
                  key={`${index}-${i}`}
                  label="Image hidden"
                  showLabel={t('Show', { defaultValue: 'Show' })}
                  onShow={() => handleLoadMedia(url)}
                />
              )
            })
          }

          return (
            <ImageGallery
              className="mt-2"
              key={index}
              images={allImages}
              start={start}
              end={end}
              mustLoad={mustLoadMedia}
              compactMedia={compactMedia}
              isSingleMedia={totalMediaCount <= 2}
            />
          )
        }
        if (node.type === 'media') {
          const localImetaTag = mediaUpload.getImetaTagByUrl(node.data)
          const mediaInfo =
            mediaInfoByUrl.get(node.data) ??
            (localImetaTag ? getImetaInfoFromImetaTag(localImetaTag, event?.pubkey) : undefined)
          if (textOnlyMode) {
            const isLoaded = loadedMedia.has(node.data)
            if (isLoaded) {
              return (
                <MediaPlayer
                  className="mt-2"
                  key={index}
                  src={node.data}
                  pubkey={event?.pubkey}
                  mustLoad
                  compactMedia={compactMedia}
                  isSingleMedia={totalMediaCount <= 2}
                  isGifLike={!!mediaInfo?.gifLoop}
                />
              )
            }
            return (
              <HiddenMediaChip
                key={index}
                label="Video hidden"
                showLabel={t('Show', { defaultValue: 'Show' })}
                onShow={() => handleLoadMedia(node.data)}
              />
            )
          }
          return (
            <MediaPlayer
              className="mt-2"
              key={index}
              src={node.data}
              pubkey={event?.pubkey}
              mustLoad={mustLoadMedia}
              compactMedia={compactMedia}
              isSingleMedia={totalMediaCount <= 2}
              isGifLike={!!mediaInfo?.gifLoop}
            />
          )
        }
        if (node.type === 'url') {
          return <EmbeddedNormalUrl url={node.data} key={index} />
        }
        if (node.type === 'websocket-url') {
          return <EmbeddedWebsocketUrl url={node.data} key={index} />
        }
        if (node.type === 'event') {
          const id = node.data.split(':')[1]
          return <EmbeddedNote key={index} noteId={id} className="mt-2" />
        }
        if (node.type === 'mention') {
          return <EmbeddedMention key={index} userId={node.data.split(':')[1]} />
        }
        if (node.type === 'hashtag') {
          return <EmbeddedHashtag hashtag={node.data} key={index} />
        }
        if (node.type === 'stock-symbol') {
          return <EmbeddedStockSymbol key={index} symbol={node.data} />
        }
        if (node.type === 'emoji') {
          const shortcode = node.data.split(':')[1]
          const emoji = emojiInfos.find((e) => e.shortcode === shortcode)
          if (!emoji) return node.data
          return <Emoji classNames={{ img: 'mb-1' }} emoji={emoji} key={index} />
        }
        if (node.type === 'youtube') {
          if (textOnlyMode) {
            const isLoaded = loadedMedia.has(node.data)
            if (isLoaded) {
              return (
                <YoutubeEmbeddedPlayer
                  key={index}
                  url={node.data}
                  pubkey={event?.pubkey}
                  className="mt-2"
                  mustLoad
                  isSingleMedia={totalMediaCount <= 2}
                />
              )
            }
            return (
              <HiddenMediaChip
                key={index}
                label="Video hidden"
                showLabel={t('Show', { defaultValue: 'Show' })}
                onShow={() => handleLoadMedia(node.data)}
              />
            )
          }
          return (
            <YoutubeEmbeddedPlayer
              key={index}
              url={node.data}
              pubkey={event?.pubkey}
              className="mt-2"
              mustLoad={mustLoadMedia}
              isSingleMedia={totalMediaCount <= 2}
            />
          )
        }
        return null
      })}
      {fallbackQuotes?.map((quoteId, index) => (
        <EmbeddedNote
          key={`fallback-quote-${quoteId}-${index}`}
          noteId={quoteId}
          className="mt-2"
        />
      ))}
      {!textOnlyMode && lastNormalUrl && (
        <WebPreview className="mt-2" url={lastNormalUrl} pubkey={event?.pubkey} />
      )}
      {!textOnlyMode && !!relayUrls?.length && <RelayPreview className="mt-2" urls={relayUrls} />}
    </div>
  )
}

function HiddenMediaChip({
  label,
  showLabel,
  onShow
}: {
  label: string
  showLabel?: string
  onShow?: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 text-muted-foreground text-xs px-2 py-0.5 mt-1">
      {label}
      {onShow ? (
        <>
          <span className="opacity-60">·</span>
          <button
            type="button"
            className="underline underline-offset-2 text-muted-foreground/90 hover:text-foreground"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onShow()
            }}
          >
            {showLabel ?? 'Show'}
          </button>
        </>
      ) : null}
    </span>
  )
}
