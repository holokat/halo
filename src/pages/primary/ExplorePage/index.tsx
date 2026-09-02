import Explore from '@/components/Explore'
import SearchBar from '@/components/SearchBar'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { TSearchParams } from '@/types'

import { forwardRef, useState } from 'react'

const ExplorePage = forwardRef((_, ref) => {
  const [input, setInput] = useState('')
  const [searchParams, setSearchParams] = useState<TSearchParams | null>(null)

  const handleSearch = (params: TSearchParams | null) => {
    setSearchParams(params)
    if (params?.input) {
      setInput(params.input)
    }
  }

  return (
    <PrimaryPageLayout
      ref={ref}
      pageName="explore"
      titlebar={
        <ExplorePageTitlebar
          input={input}
          setInput={setInput}
          searchParams={searchParams}
          onSearch={handleSearch}
        />
      }
      displayScrollToTopButton
    >
      <Explore
        input={input}
        setInput={setInput}
        searchParams={searchParams}
        onSearch={handleSearch}
        showInlineSearch={false}
      />
    </PrimaryPageLayout>
  )
})
ExplorePage.displayName = 'ExplorePage'
export default ExplorePage

function ExplorePageTitlebar({
  input,
  setInput,
  searchParams,
  onSearch
}: {
  input: string
  setInput: (input: string) => void
  searchParams: TSearchParams | null
  onSearch: (params: TSearchParams | null) => void
}) {
  return (
    <div className="flex items-center gap-2 justify-between h-full">
      <div className="flex-1 min-w-0">
        <SearchBar
          input={input}
          setInput={setInput}
          onSearch={onSearch}
          className="h-full"
          searchInputClassName="!bg-transparent !shadow-none !border-0 !px-0 md:!pl-2 rounded-none [&_input]:mx-2 [&_input]:font-semibold [&_input]:text-[length:var(--title-font-size,18px)] [&_input]:placeholder:font-semibold [&_input]:placeholder:text-foreground/60 [&_svg]:text-muted-foreground"
        />
      </div>
    </div>
  )
}
