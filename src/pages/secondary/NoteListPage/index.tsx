import NormalFeed from '@/components/NormalFeed'
import StockQuoteCard from '@/components/StockQuoteCard'
import { BIG_RELAY_URLS, SEARCHABLE_RELAY_URLS } from '@/constants'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { useNostr } from '@/providers/NostrProvider'
import { TFeedSubRequest } from '@/types'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const NoteListPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { relayList } = useNostr()
  const [title, setTitle] = useState<React.ReactNode>(null)
  const [data, setData] = useState<{
    type: 'hashtag' | 'search' | 'externalContent'
    kinds?: number[]
  } | null>(null)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [currentStockSymbol, setCurrentStockSymbol] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const searchParams = new URLSearchParams(window.location.search)
      const kinds = searchParams
        .getAll('k')
        .map((k) => parseInt(k))
        .filter((k) => !isNaN(k))
      const stockSymbol = searchParams.get('stock')
      if (stockSymbol) {
        const normalizedStockSymbol = stockSymbol.replace(/^\$/, '').toUpperCase()
        const normalizedStockTag = normalizedStockSymbol.toLowerCase()
        setData({ type: 'search' })
        setTitle(`$${normalizedStockSymbol}`)
        setCurrentStockSymbol(normalizedStockSymbol)
        setSubRequests([
          {
            filter: { '#t': [normalizedStockTag], ...(kinds.length > 0 ? { kinds } : {}) },
            urls: BIG_RELAY_URLS
          },
          {
            filter: { search: `$${normalizedStockSymbol}`, ...(kinds.length > 0 ? { kinds } : {}) },
            urls: SEARCHABLE_RELAY_URLS
          }
        ])
        return
      }
      const hashtag = searchParams.get('t')
      if (hashtag) {
        setData({ type: 'hashtag' })
        setTitle(`# ${hashtag}`)
        setCurrentStockSymbol(null)
        setSubRequests([
          {
            filter: { '#t': [hashtag], ...(kinds.length > 0 ? { kinds } : {}) },
            urls: BIG_RELAY_URLS
          }
        ])
        return
      }
      const search = searchParams.get('s')
      if (search) {
        setData({ type: 'search' })
        setTitle(`${t('Search')}: ${search}`)
        setCurrentStockSymbol(null)
        setSubRequests([
          {
            filter: { search, ...(kinds.length > 0 ? { kinds } : {}) },
            urls: SEARCHABLE_RELAY_URLS
          }
        ])
        return
      }
      const externalContentId = searchParams.get('i')
      if (externalContentId) {
        setData({ type: 'externalContent' })
        setTitle(externalContentId)
        setCurrentStockSymbol(null)
        setSubRequests([
          {
            filter: { '#I': [externalContentId], ...(kinds.length > 0 ? { kinds } : {}) },
            urls: BIG_RELAY_URLS.concat(relayList?.write || [])
          }
        ])
        return
      }
    }
    init()
  }, [])

  let content: React.ReactNode = null
  if (data) {
    content = (
      <div className="space-y-4">
        {currentStockSymbol && <StockQuoteCard symbol={currentStockSymbol} />}
        <NormalFeed subRequests={subRequests} />
      </div>
    )
  }

  return (
    <SecondaryPageLayout ref={ref} index={index} title={title} displayScrollToTopButton>
      {content}
    </SecondaryPageLayout>
  )
})
NoteListPage.displayName = 'NoteListPage'
export default NoteListPage
