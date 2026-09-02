import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import storage from '@/services/local-storage.service'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'

type TNewsFeedSettingsContext = {
  newsRelays: string[]
  addNewsRelay: (relay: string) => void
  removeNewsRelay: (relay: string) => void
}

const NewsFeedSettingsContext = createContext<TNewsFeedSettingsContext | undefined>(undefined)

export function NewsFeedSettingsProvider({ children }: { children: ReactNode }) {
  const [newsRelays, setNewsRelays] = useState<string[]>(() => [...storage.getNewsFeedRelays()])

  useEffect(() => {
    storage.setNewsFeedRelays(newsRelays)
  }, [newsRelays])

  const addNewsRelay = (rawRelay: string) => {
    const relay = normalizeUrl(rawRelay)
    if (!relay || !isWebsocketUrl(relay)) return

    setNewsRelays((current) => (current.includes(relay) ? current : [...current, relay]))
  }

  const removeNewsRelay = (rawRelay: string) => {
    const relay = normalizeUrl(rawRelay)
    if (!relay) return

    setNewsRelays((current) => current.filter((item) => item !== relay))
  }

  return (
    <NewsFeedSettingsContext.Provider value={{ newsRelays, addNewsRelay, removeNewsRelay }}>
      {children}
    </NewsFeedSettingsContext.Provider>
  )
}

export function useNewsFeedSettings() {
  const context = useContext(NewsFeedSettingsContext)
  if (!context) {
    throw new Error('useNewsFeedSettings must be used within a NewsFeedSettingsProvider')
  }
  return context
}
