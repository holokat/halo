import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

type TWidgetSidebarDismissedContext = {
  widgetSidebarDismissed: boolean
  setWidgetSidebarDismissed: (dismissed: boolean) => void
}

const WidgetSidebarDismissedContext = createContext<TWidgetSidebarDismissedContext | undefined>(
  undefined
)

function isReloadNavigation() {
  if (typeof window === 'undefined') {
    return false
  }

  const navigationEntry = window.performance
    ?.getEntriesByType?.('navigation')
    ?.at(0) as PerformanceNavigationTiming | undefined

  if (navigationEntry?.type === 'reload') {
    return true
  }

  const legacyNavigation = window.performance?.navigation
  return legacyNavigation?.type === legacyNavigation?.TYPE_RELOAD
}

export function useWidgetSidebarDismissed() {
  const context = useContext(WidgetSidebarDismissedContext)
  if (context === undefined) {
    throw new Error(
      'useWidgetSidebarDismissed must be used within a WidgetSidebarDismissedProvider'
    )
  }
  return context
}

export function WidgetSidebarDismissedProvider({ children }: { children: ReactNode }) {
  // Use session state (not persisted) - resets on page refresh
  const [widgetSidebarDismissed, setWidgetSidebarDismissed] = useState(false)

  useEffect(() => {
    if (isReloadNavigation()) {
      setWidgetSidebarDismissed(false)
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || isReloadNavigation()) {
        setWidgetSidebarDismissed(false)
      }
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return (
    <WidgetSidebarDismissedContext.Provider
      value={{
        widgetSidebarDismissed,
        setWidgetSidebarDismissed
      }}
    >
      {children}
    </WidgetSidebarDismissedContext.Provider>
  )
}
