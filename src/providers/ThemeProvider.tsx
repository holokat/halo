import storage from '@/services/local-storage.service'
import { TTheme, TThemeSetting } from '@/types'
import { createContext, useContext, useEffect, useState } from 'react'

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemeProviderState = {
  themeSetting: TThemeSetting
  theme: TTheme
  setThemeSetting: (themeSetting: TThemeSetting) => Promise<void>
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeSetting, setThemeSetting] = useState<TThemeSetting>(() => storage.getThemeSetting())
  const [theme, setTheme] = useState<TTheme>(() =>
    themeSetting === 'system' ? getSystemTheme() : themeSetting
  )

  useEffect(() => {
    if (themeSetting !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handleChange)
    setTheme(mediaQuery.matches ? 'dark' : 'light')

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [themeSetting])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    root.style.colorScheme = theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', theme === 'dark' ? '#171717' : '#FFFFFF')
    })
  }, [theme])

  return (
    <ThemeProviderContext.Provider
      value={{
        themeSetting: themeSetting,
        theme: theme,
        setThemeSetting: async (themeSetting: TThemeSetting) => {
          storage.setThemeSetting(themeSetting)
          setThemeSetting(themeSetting)
          if (themeSetting === 'system') {
            setTheme(getSystemTheme())
            return
          }
          setTheme(themeSetting)
        }
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
