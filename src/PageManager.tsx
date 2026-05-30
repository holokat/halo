import { DECK_VIEW_MODE, LAYOUT_MODE } from '@/constants'
import { cn } from '@/lib/utils'
import { CurrentRelaysProvider } from '@/providers/CurrentRelaysProvider'
import { useDeckView } from '@/providers/DeckViewProvider'
import { useLayoutMode } from '@/providers/LayoutModeProvider'
import { usePageTheme } from '@/providers/PageThemeProvider'
import { useCompactSidebar } from '@/providers/CompactSidebarProvider'
import {
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
  useEffect,
  useRef,
  useState
} from 'react'
import { normalizeUrl } from './lib/url'
import { NotificationProvider } from './providers/NotificationProvider'
import { useScreenSize } from './providers/ScreenSizeProvider'
import { useWidgetSidebarDismissed } from './providers/WidgetSidebarDismissedProvider'
import modalManager from './services/modal-manager.service'
import { PRIMARY_PAGE_MAP, PRIMARY_PAGE_REF_MAP } from './page-manager/page-registry'
import { PrimaryPageContext, SecondaryPageContext, useSecondaryPage } from './page-manager/contexts'
import { type TPrimaryPageName, type TStackItem } from './page-manager/types'
import { isCurrentPage, findAndCreateComponent, pushNewPageToStack } from './page-manager/routing'
import { PageManagerShell } from './page-manager/layout'
export { usePrimaryPage, useSecondaryPage } from './page-manager/contexts'
export type { TPrimaryPageName } from './page-manager/page-registry'

export function PageManager({ maxStackSize = 5 }: { maxStackSize?: number }) {
  const { pageTheme } = usePageTheme()
  const [currentPrimaryPage, setCurrentPrimaryPage] = useState<TPrimaryPageName>('home')
  const [primaryPages, setPrimaryPages] = useState<
    { name: TPrimaryPageName; element: ReactNode; props?: any }[]
  >([
    {
      name: 'home',
      element: PRIMARY_PAGE_MAP.home
    }
  ])
  const [secondaryStack, setSecondaryStack] = useState<TStackItem[]>([])
  const { isSmallScreen } = useScreenSize()
  const { layoutMode } = useLayoutMode()
  const { deckViewMode, pinnedColumns, unpinColumn } = useDeckView()
  const { setCompactSidebar } = useCompactSidebar()
  const { widgetSidebarDismissed } = useWidgetSidebarDismissed()
  const ignorePopStateRef = useRef(false)

  // Auto-collapse sidebar when in multi-column mode or island mode
  useEffect(() => {
    if (layoutMode === LAYOUT_MODE.ISLAND) {
      setCompactSidebar(true)
    } else if (layoutMode === LAYOUT_MODE.FULL_WIDTH && deckViewMode === DECK_VIEW_MODE.MULTI_COLUMN) {
      setCompactSidebar(true)
    }
  }, [layoutMode, deckViewMode, setCompactSidebar])

  useEffect(() => {
    if (['/npub1', '/nprofile1'].some((prefix) => window.location.pathname.startsWith(prefix))) {
      window.history.replaceState(
        null,
        '',
        '/users' + window.location.pathname + window.location.search + window.location.hash
      )
    } else if (
      ['/note1', '/nevent1', '/naddr1'].some((prefix) =>
        window.location.pathname.startsWith(prefix)
      )
    ) {
      window.history.replaceState(
        null,
        '',
        '/notes' + window.location.pathname + window.location.search + window.location.hash
      )
    }
    window.history.pushState(null, '', window.location.href)
    if (window.location.pathname !== '/') {
      const url = window.location.pathname + window.location.search + window.location.hash
      setSecondaryStack((prevStack) => {
        if (isCurrentPage(prevStack, url)) return prevStack

        const { newStack, newItem } = pushNewPageToStack(
          prevStack,
          url,
          maxStackSize,
          window.history.state?.index
        )
        if (newItem) {
          window.history.replaceState({ index: newItem.index, url }, '', url)
        }
        return newStack
      })
    } else {
      const searchParams = new URLSearchParams(window.location.search)
      const r = searchParams.get('r')
      if (r) {
        const url = normalizeUrl(r)
        if (url) {
          navigatePrimaryPage('relay', { url })
        }
      }
    }

    const onPopState = (e: PopStateEvent) => {
      if (ignorePopStateRef.current) {
        ignorePopStateRef.current = false
        return
      }

      const closeModal = modalManager.pop()
      if (closeModal) {
        ignorePopStateRef.current = true
        window.history.forward()
        return
      }

      let state = e.state as { index: number; url: string } | null
      setSecondaryStack((pre) => {
        const currentItem = pre[pre.length - 1] as TStackItem | undefined
        const currentIndex = currentItem?.index
        if (!state) {
          const currentUrl = window.location.pathname + window.location.search + window.location.hash
          if (currentUrl !== '/') {
            // State is null but URL is not root - this shouldn't happen normally
            // Clear the stack and let the system navigate to the URL
            return []
          } else {
            // Back to root
            state = { index: -1, url: '/' }
          }
        }

        // Ensure state has a valid URL
        if (!state.url) {
          const currentUrl = window.location.pathname + window.location.search + window.location.hash
          if (currentUrl === '/') {
            return []
          }
          // Try to use the current URL from the browser
          state.url = currentUrl
        }
        const nextState = state

        // Go forward
        if (currentIndex === undefined || nextState.index > currentIndex) {
          const { newStack } = pushNewPageToStack(pre, nextState.url, maxStackSize)
          return newStack
        }

        if (nextState.index === currentIndex) {
          return pre
        }

        // Go back
        const newStack = pre.filter((item) => item.index <= nextState.index)
        const topItem = newStack[newStack.length - 1] as TStackItem | undefined
        if (!topItem) {
          // Create a new stack item if it's not exist (e.g. when the user refreshes the page, the stack will be empty)
          if (nextState.url) {
            const { component, ref } = findAndCreateComponent(nextState.url, nextState.index)
            if (component) {
              newStack.push({
                index: nextState.index,
                url: nextState.url,
                component,
                ref
              })
            }
          }
        } else if (!topItem.component && topItem.url) {
          // Load the component if it's not cached
          const { component, ref } = findAndCreateComponent(topItem.url, nextState.index)
          if (component) {
            topItem.component = component
            topItem.ref = ref
          }
        }
        if (newStack.length === 0) {
          window.history.replaceState(null, '', '/')
        }
        return newStack
      })
    }

    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const navigatePrimaryPage = (page: TPrimaryPageName, props?: any) => {
    const needScrollToTop = page === currentPrimaryPage
    setPrimaryPages((prev) => {
      const exists = prev.find((p) => p.name === page)
      if (exists && props) {
        exists.props = props
        return [...prev]
      } else if (!exists) {
        return [...prev, { name: page, element: PRIMARY_PAGE_MAP[page], props }]
      }
      return prev
    })
    setCurrentPrimaryPage(page)
    if (needScrollToTop) {
      PRIMARY_PAGE_REF_MAP[page].current?.scrollToTop('smooth')
    }
    if (isSmallScreen) {
      clearSecondaryPages()
    }
  }

  const pushSecondaryPage = (url: string, index?: number) => {
    setSecondaryStack((prevStack) => {
      if (isCurrentPage(prevStack, url)) {
        const currentItem = prevStack[prevStack.length - 1]
        if (currentItem?.ref?.current) {
          currentItem.ref.current.scrollToTop('instant')
        }
        return prevStack
      }

      const { newStack, newItem } = pushNewPageToStack(prevStack, url, maxStackSize, index)
      if (newItem) {
        window.history.pushState({ index: newItem.index, url }, '', url)
      }
      return newStack
    })
  }

  const popSecondaryPage = () => {
    if (secondaryStack.length === 1) {
      // back to home page
      window.history.replaceState(null, '', '/')
      setSecondaryStack([])
    } else {
      window.history.go(-1)
    }
  }

  const clearSecondaryPages = () => {
    if (secondaryStack.length === 0) return
    if (secondaryStack.length === 1) {
      window.history.replaceState(null, '', '/')
      setSecondaryStack([])
      return
    }
    window.history.go(-secondaryStack.length)
  }

  if (isSmallScreen) {
    return (
      <PrimaryPageContext.Provider
        value={{
          navigate: navigatePrimaryPage,
          current: currentPrimaryPage,
          display: secondaryStack.length === 0
        }}
      >
        <SecondaryPageContext.Provider
          value={{
            push: pushSecondaryPage,
            pop: popSecondaryPage,
            clear: clearSecondaryPages,
            currentIndex: secondaryStack.length
              ? secondaryStack[secondaryStack.length - 1].index
              : 0
          }}
        >
          <CurrentRelaysProvider>
            <NotificationProvider>
              <PageManagerShell
                isSmallScreen={isSmallScreen}
                layoutMode={layoutMode}
                deckViewMode={deckViewMode}
                pageTheme={pageTheme}
                primaryPages={primaryPages}
                currentPrimaryPage={currentPrimaryPage}
                secondaryStack={secondaryStack}
                pinnedColumns={pinnedColumns}
                widgetSidebarDismissed={widgetSidebarDismissed}
              />
            </NotificationProvider>
          </CurrentRelaysProvider>
        </SecondaryPageContext.Provider>
      </PrimaryPageContext.Provider>
    )
  }

  return (
    <PrimaryPageContext.Provider
      value={{
        navigate: navigatePrimaryPage,
        current: currentPrimaryPage,
        display: true
      }}
    >
      <SecondaryPageContext.Provider
        value={{
          push: pushSecondaryPage,
          pop: popSecondaryPage,
          clear: clearSecondaryPages,
          currentIndex: secondaryStack.length ? secondaryStack[secondaryStack.length - 1].index : 0
        }}
      >
        <CurrentRelaysProvider>
          <NotificationProvider>
            <PageManagerShell
              isSmallScreen={isSmallScreen}
              layoutMode={layoutMode}
              deckViewMode={deckViewMode}
              pageTheme={pageTheme}
              primaryPages={primaryPages}
              currentPrimaryPage={currentPrimaryPage}
              secondaryStack={secondaryStack}
              pinnedColumns={pinnedColumns}
              widgetSidebarDismissed={widgetSidebarDismissed}
            />
          </NotificationProvider>
        </CurrentRelaysProvider>
      </SecondaryPageContext.Provider>
    </PrimaryPageContext.Provider>
  )
}

type SecondaryPageLinkProps = HTMLAttributes<HTMLSpanElement | HTMLDivElement> & {
  to: string
  children: ReactNode
  as?: 'span' | 'div'
}

export const SecondaryPageLink = forwardRef<HTMLSpanElement | HTMLDivElement, SecondaryPageLinkProps>(
  ({ to, children, className, onClick, as = 'span', ...props }, ref) => {
    const { push } = useSecondaryPage()
    const handleClick = (e: MouseEvent<HTMLSpanElement | HTMLDivElement>) => {
      onClick?.(e)
      if (!e.defaultPrevented) {
        push(to)
      }
    }

    if (as === 'div') {
      return (
        <div
          ref={ref as React.ForwardedRef<HTMLDivElement>}
          className={cn('cursor-pointer', className)}
          onClick={handleClick}
          {...(props as HTMLAttributes<HTMLDivElement>)}
        >
          {children}
        </div>
      )
    }

    return (
      <span
        ref={ref as React.ForwardedRef<HTMLSpanElement>}
        className={cn('cursor-pointer', className)}
        onClick={handleClick}
        {...(props as HTMLAttributes<HTMLSpanElement>)}
      >
        {children}
      </span>
    )
  }
)

SecondaryPageLink.displayName = 'SecondaryPageLink'
