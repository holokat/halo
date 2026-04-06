import StockQuoteCard from '@/components/StockQuoteCard'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { toNoteList } from '@/lib/link'
import { SecondaryPageLink } from '@/PageManager'
import stockQuoteService from '@/services/stock-quote.service'
import { useMemo, useState } from 'react'

export function EmbeddedStockSymbol({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false)
  const normalizedSymbol = useMemo(() => symbol.replace(/^\$/, '').trim().toUpperCase(), [symbol])

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <SecondaryPageLink
          to={toNoteList({ stockSymbol: normalizedSymbol })}
          className="inline rounded-sm px-0.5 font-medium text-left underline decoration-dotted underline-offset-4 hover:bg-muted/60 break-words [overflow-wrap:anywhere]"
          onMouseEnter={() => {
            void stockQuoteService.prefetchQuote(normalizedSymbol)
          }}
          onFocus={() => {
            void stockQuoteService.prefetchQuote(normalizedSymbol)
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {symbol}
        </SecondaryPageLink>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 overflow-hidden p-0">
        <StockQuoteCard symbol={normalizedSymbol} enabled={open} variant="hover" />
      </HoverCardContent>
    </HoverCard>
  )
}
