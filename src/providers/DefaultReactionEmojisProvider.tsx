import localStorageService from '@/services/local-storage.service'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '🥲', '👀', '🫡', '🫂']

interface DefaultReactionEmojisContextType {
  reactionOptionsEnabled: boolean
  setReactionOptionsEnabled: (enabled: boolean) => void
  defaultReactionEmojis: string[]
  setDefaultReactionEmojis: (emojis: string[]) => void
  resetToDefault: () => void
}

const DefaultReactionEmojisContext = createContext<DefaultReactionEmojisContextType | undefined>(
  undefined
)

export function DefaultReactionEmojisProvider({ children }: { children: ReactNode }) {
  const [reactionOptionsEnabled, setReactionOptionsEnabledState] = useState<boolean>(() =>
    localStorageService.getReactionOptionsEnabled()
  )
  const [defaultReactionEmojis, setDefaultReactionEmojisState] = useState<string[]>(() =>
    localStorageService.getDefaultReactionEmojis()
  )

  const setReactionOptionsEnabled = (enabled: boolean) => {
    setReactionOptionsEnabledState(enabled)
    localStorageService.setReactionOptionsEnabled(enabled)
  }

  const setDefaultReactionEmojis = (emojis: string[]) => {
    setDefaultReactionEmojisState(emojis)
    localStorageService.setDefaultReactionEmojis(emojis)
  }

  const resetToDefault = () => {
    setDefaultReactionEmojis(DEFAULT_REACTION_EMOJIS)
  }

  useEffect(() => {
    const handleStorageChange = () => {
      setReactionOptionsEnabledState(localStorageService.getReactionOptionsEnabled())
      setDefaultReactionEmojisState(localStorageService.getDefaultReactionEmojis())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <DefaultReactionEmojisContext.Provider
      value={{
        reactionOptionsEnabled,
        setReactionOptionsEnabled,
        defaultReactionEmojis,
        setDefaultReactionEmojis,
        resetToDefault
      }}
    >
      {children}
    </DefaultReactionEmojisContext.Provider>
  )
}

export function useDefaultReactionEmojis() {
  const context = useContext(DefaultReactionEmojisContext)
  if (!context) {
    throw new Error('useDefaultReactionEmojis must be used within DefaultReactionEmojisProvider')
  }
  return context
}

export { DEFAULT_REACTION_EMOJIS }
