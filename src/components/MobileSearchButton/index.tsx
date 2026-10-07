import FloatingGlassButton from '@/components/FloatingGlassButton'
import SearchBar, { type TSearchBarRef } from '@/components/SearchBar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type TSearchParams } from '@/types'
import { IconMagnifyingGlass as Search } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMagnifyingGlass'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function MobileSearchButton({
  input,
  setInput,
  onSearch,
  trailingContent
}: {
  input: string
  setInput: (input: string) => void
  onSearch: (params: TSearchParams | null) => void
  trailingContent?: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const searchBarRef = useRef<TSearchBarRef>(null)

  const handleSearch = (params: TSearchParams | null) => {
    onSearch(params)
    if (params) setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FloatingGlassButton aria-label={t('Search')}>
          <Search />
        </FloatingGlassButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[calc(100vw-1.5rem)] max-w-md border-0 bg-background/80 p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.10),0_12px_36px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-[18px] supports-[backdrop-filter]:bg-background/60 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_14px_40px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.12)]"
        style={{ borderRadius: '1.25rem' }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => searchBarRef.current?.focus())
        }}
      >
        <SearchBar
          ref={searchBarRef}
          input={input}
          setInput={setInput}
          onSearch={handleSearch}
          mobileInlineResults
          className="h-11"
          searchInputClassName="rounded-xl bg-background/65 shadow-none"
          trailingContent={trailingContent}
        />
      </PopoverContent>
    </Popover>
  )
}
