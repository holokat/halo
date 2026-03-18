import storage from '@/services/local-storage.service'
import { TEmoji, TLogoStyle } from '@/types'
import { createContext, useContext, useState } from 'react'

type TLogoStyleContext = {
  logoStyle: TLogoStyle
  setLogoStyle: (style: TLogoStyle) => void
  customLogoText: string
  setCustomLogoText: (text: string) => void
  customLogoEmoji: string | TEmoji
  setCustomLogoEmoji: (emoji: string | TEmoji) => void
}

const LogoStyleContext = createContext<TLogoStyleContext | undefined>(undefined)

export const useLogoStyle = () => {
  const context = useContext(LogoStyleContext)
  if (!context) {
    throw new Error('useLogoStyle must be used within a LogoStyleProvider')
  }
  return context
}

export function LogoStyleProvider({ children }: { children: React.ReactNode }) {
  const [logoStyle, setLogoStyleState] = useState(storage.getLogoStyle())
  const [customLogoText, setCustomLogoTextState] = useState(storage.getCustomLogoText())
  const [customLogoEmoji, setCustomLogoEmojiState] = useState(storage.getCustomLogoEmoji())

  const setLogoStyle = (style: TLogoStyle) => {
    setLogoStyleState(style)
    storage.setLogoStyle(style)
  }

  const setCustomLogoText = (text: string) => {
    setCustomLogoTextState(text)
    storage.setCustomLogoText(text)
  }

  const setCustomLogoEmoji = (emoji: string | TEmoji) => {
    setCustomLogoEmojiState(emoji)
    storage.setCustomLogoEmoji(emoji)
  }

  return (
    <LogoStyleContext.Provider
      value={{
        logoStyle,
        setLogoStyle,
        customLogoText,
        setCustomLogoText,
        customLogoEmoji,
        setCustomLogoEmoji
      }}
    >
      {children}
    </LogoStyleContext.Provider>
  )
}
