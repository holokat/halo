import { CUSTOM_FEEDS_CHANGED_EVENT } from '@/lib/feed-sync'
import { useNostr } from '@/providers/NostrProvider'
import storage from '@/services/local-storage.service'
import { TCustomFeed } from '@/types'
import { createContext, useContext, useEffect, useState } from 'react'

type TCustomFeedsContext = {
  customFeeds: TCustomFeed[]
  addCustomFeed: (feed: TCustomFeed) => void
  removeCustomFeed: (id: string) => void
  updateCustomFeed: (id: string, updates: Partial<TCustomFeed>) => void
}

const CustomFeedsContext = createContext<TCustomFeedsContext | undefined>(undefined)

export const useCustomFeeds = () => {
  const context = useContext(CustomFeedsContext)
  if (!context) {
    throw new Error('useCustomFeeds must be used within a CustomFeedsProvider')
  }
  return context
}

export const useOptionalCustomFeeds = () => {
  return useContext(CustomFeedsContext)
}

export function CustomFeedsProvider({ children }: { children: React.ReactNode }) {
  const { pubkey } = useNostr()
  const [customFeeds, setCustomFeeds] = useState<TCustomFeed[]>([])

  useEffect(() => {
    setCustomFeeds(storage.getCustomFeeds(pubkey))

    const handleCustomFeedsChanged = () => {
      setCustomFeeds(storage.getCustomFeeds(pubkey))
    }

    window.addEventListener(CUSTOM_FEEDS_CHANGED_EVENT, handleCustomFeedsChanged)

    return () => {
      window.removeEventListener(CUSTOM_FEEDS_CHANGED_EVENT, handleCustomFeedsChanged)
    }
  }, [pubkey])

  const addCustomFeed = (feed: TCustomFeed) => {
    storage.addCustomFeed(feed, pubkey)
    setCustomFeeds(storage.getCustomFeeds(pubkey))
  }

  const removeCustomFeed = (id: string) => {
    storage.removeCustomFeed(id, pubkey)
    setCustomFeeds(storage.getCustomFeeds(pubkey))
  }

  const updateCustomFeed = (id: string, updates: Partial<TCustomFeed>) => {
    storage.updateCustomFeed(id, updates, pubkey)
    setCustomFeeds(storage.getCustomFeeds(pubkey))
  }

  return (
    <CustomFeedsContext.Provider
      value={{
        customFeeds,
        addCustomFeed,
        removeCustomFeed,
        updateCustomFeed
      }}
    >
      {children}
    </CustomFeedsContext.Provider>
  )
}
