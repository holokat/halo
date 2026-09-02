import SearchBar from '@/components/SearchBar'
import SearchResult from '@/components/SearchResult'
import TrendingNotes from '@/components/TrendingNotes'
import { type TSearchParams } from '@/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function Explore({
  isInDeckView = false,
  input: controlledInput,
  setInput: controlledSetInput,
  searchParams: controlledSearchParams,
  onSearch: controlledOnSearch,
  showInlineSearch = true
}: {
  isInDeckView?: boolean
  input?: string
  setInput?: (input: string) => void
  searchParams?: TSearchParams | null
  onSearch?: (params: TSearchParams | null) => void
  showInlineSearch?: boolean
} = {}) {
  const { t } = useTranslation()
  const [localInput, setLocalInput] = useState('')
  const [localSearchParams, setLocalSearchParams] = useState<TSearchParams | null>(null)
  const input = controlledInput ?? localInput
  const searchParams = controlledSearchParams ?? localSearchParams
  const setInput = controlledSetInput ?? setLocalInput

  const handleSearch = (params: TSearchParams | null) => {
    if (controlledOnSearch) {
      controlledOnSearch(params)
    } else {
      setLocalSearchParams(params)
    }

    if (params?.input) {
      setInput(params.input)
    }
  }

  return (
    <div className="pb-5">
      {showInlineSearch && (
        <div className="px-4 pt-4">
          <SearchBar
            onSearch={handleSearch}
            input={input}
            setInput={setInput}
            currentSearchParams={searchParams}
          />
        </div>
      )}

      {searchParams ? (
        <div className="px-4 pt-5">
          <SearchResult searchParams={searchParams} isInDeckView={isInDeckView} />
        </div>
      ) : (
        <section className="pt-7" aria-labelledby="search-discovery-title">
          <div className="px-4 pb-3">
            <h2 id="search-discovery-title" className="text-base font-semibold">
              {t('Trending now', { defaultValue: 'Trending now' })}
            </h2>
          </div>
          <TrendingNotes showHeader={false} />
        </section>
      )}
    </div>
  )
}
