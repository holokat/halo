import { DECK_VIEW_MODE, LAYOUT_MODE } from '@/constants'
import { cn } from '@/lib/utils'
import BackgroundAudio from '@/components/BackgroundAudio'
import BottomNavigationBar from '@/components/BottomNavigationBar'
import DeckColumn from '@/components/DeckColumn'
import HomePage from '@/pages/secondary/HomePage'
import Sidebar from '@/components/Sidebar'
import TooManyRelaysAlertDialog from '@/components/TooManyRelaysAlertDialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { type ReactElement, type ReactNode } from 'react'
import { cloneElement } from 'react'
import { usePageTheme } from '@/providers/PageThemeProvider'
import { useSecondaryPage } from './contexts'
import { type TPrimaryPageName, type TStackItem } from './types'

type TPrimaryPageEntry = {
  name: TPrimaryPageName
  element: ReactNode
  props?: any
}

type TLayoutMode = (typeof LAYOUT_MODE)[keyof typeof LAYOUT_MODE]
type TDeckViewMode = (typeof DECK_VIEW_MODE)[keyof typeof DECK_VIEW_MODE]

function isVisiblePinnedColumn(column: any) {
  switch (column.type) {
    case 'custom':
      return !!column.props?.customFeedId
    case 'relay':
      return !!column.props?.url
    case 'relays':
      return !!column.props?.activeRelaySetId
    case 'profile':
      return !!column.props?.pubkey
    case 'search':
      return !!column.props?.searchParams
    default:
      return true
  }
}

export function HomePageWrapper({
  children,
  secondaryStackLength,
  widgetSidebarDismissed
}: {
  children: ReactNode
  secondaryStackLength: number
  widgetSidebarDismissed: boolean
}) {
  const { pageTheme } = usePageTheme()

  const isHomePage = secondaryStackLength === 0 && !widgetSidebarDismissed
  const isDismissed = secondaryStackLength === 0 && widgetSidebarDismissed

  return (
    <div
      className={cn(
        'h-full min-h-0 overflow-hidden',
        isHomePage || isDismissed ? 'bg-transparent shadow-none' : cn('bg-card', pageTheme === 'white' ? '' : 'shadow-lg'),
        pageTheme === 'pure-black' && !isHomePage && !isDismissed && 'border border-neutral-900',
        pageTheme === 'white' && !isHomePage && !isDismissed && 'border border-border'
      )}
      style={{ borderRadius: 'var(--card-radius, 8px)' }}
    >
      {children}
    </div>
  )
}

export function DeckLayout({
  primaryPages,
  currentPrimaryPage,
  secondaryStack,
  pinnedColumns
}: {
  primaryPages: TPrimaryPageEntry[]
  currentPrimaryPage: TPrimaryPageName
  secondaryStack: TStackItem[]
  pinnedColumns: any[]
}) {
  const { pageTheme } = usePageTheme()
  const { pop } = useSecondaryPage()

  const validPinnedColumns = pinnedColumns.filter(isVisiblePinnedColumn)
  const columnCount = 1 + validPinnedColumns.length
  const isDrawerOpen = secondaryStack.length > 0

  return (
    <>
      <div
        className="gap-2 w-full px-2 py-2 overflow-x-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`
        }}
      >
        <div
          className={cn(
            'bg-background min-w-0 overflow-hidden w-full',
            pageTheme === 'pure-black' && 'border border-neutral-900',
            pageTheme === 'white' ? 'border border-border' : 'shadow-lg'
          )}
          style={{ borderRadius: 'var(--card-radius, 8px)' }}
        >
          {primaryPages.map(({ name, element, props }) => (
            <div
              key={name}
              className="flex h-full w-full flex-col"
              style={{
                display: currentPrimaryPage === name ? 'block' : 'none'
              }}
            >
              {props ? cloneElement(element as ReactElement, props) : element}
            </div>
          ))}
        </div>

        {validPinnedColumns.map((column) => (
          <DeckColumn key={column.id} column={column} />
        ))}
      </div>

      <Sheet
        open={isDrawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            pop()
          }
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            'min-w-[520px] gap-0 p-0 sm:min-w-[520px]',
            pageTheme === 'pure-black' && 'border-l border-neutral-900'
          )}
          hideClose
        >
          {secondaryStack.map((item, index) => (
            <div
              key={item.index}
              className="flex h-full w-full flex-col"
              style={{ display: index === secondaryStack.length - 1 ? 'block' : 'none' }}
            >
              {item.component}
            </div>
          ))}
        </SheetContent>
      </Sheet>
    </>
  )
}

export function PageManagerShell({
  isSmallScreen,
  layoutMode,
  deckViewMode,
  pageTheme,
  primaryPages,
  currentPrimaryPage,
  secondaryStack,
  pinnedColumns,
  widgetSidebarDismissed
}: {
  isSmallScreen: boolean
  layoutMode: TLayoutMode
  deckViewMode: TDeckViewMode
  pageTheme: string
  primaryPages: TPrimaryPageEntry[]
  currentPrimaryPage: TPrimaryPageName
  secondaryStack: TStackItem[]
  pinnedColumns: any[]
  widgetSidebarDismissed: boolean
}) {
  if (isSmallScreen) {
    return (
      <div className={cn(layoutMode === LAYOUT_MODE.BOXED && 'mx-auto max-w-screen-xl')}>
        {!!secondaryStack.length &&
          secondaryStack.map((item, index) => (
            <div
              key={item.index}
              style={{
                display: index === secondaryStack.length - 1 ? 'block' : 'none'
              }}
            >
              {item.component}
            </div>
          ))}
      {primaryPages.map(({ name, element, props }) => (
        <div
          key={name}
          style={{
            display: secondaryStack.length === 0 && currentPrimaryPage === name ? 'block' : 'none'
          }}
        >
          {props ? cloneElement(element as ReactElement, props) : element}
        </div>
      ))}
      <BottomNavigationBar />
      <TooManyRelaysAlertDialog />
    </div>
  )
  }

  return (
    <div className="flex h-[var(--vh)] justify-center overflow-hidden bg-surface-background">
      {layoutMode === LAYOUT_MODE.ISLAND ? (
        <div
          className={cn(
            'fixed left-0 top-0 z-10 h-full shrink-0',
            pageTheme === 'pure-black' && 'border-r border-neutral-900'
          )}
        >
          <Sidebar />
        </div>
      ) : (
        <div
          className={cn('shrink-0', pageTheme === 'pure-black' && 'border-r border-neutral-900')}
        >
          <Sidebar />
        </div>
      )}
      {(layoutMode === LAYOUT_MODE.FULL_WIDTH || layoutMode === LAYOUT_MODE.ISLAND) &&
      deckViewMode === DECK_VIEW_MODE.MULTI_COLUMN ? (
        <DeckLayout
          primaryPages={primaryPages}
          currentPrimaryPage={currentPrimaryPage}
          secondaryStack={secondaryStack}
          pinnedColumns={pinnedColumns}
        />
      ) : (
        <div
          className={cn(
            'grid h-full min-h-0 w-full grid-cols-2 gap-2 px-2 py-2',
            layoutMode === LAYOUT_MODE.BOXED && 'max-w-screen-xl',
            layoutMode === LAYOUT_MODE.ISLAND && 'max-w-screen-xl ml-16'
          )}
        >
          <div
            className={cn(
              'bg-card min-h-0 min-w-0 overflow-hidden',
              pageTheme === 'pure-black' && 'border border-neutral-900',
              pageTheme === 'white' ? 'border border-border' : 'shadow-lg'
            )}
            style={{ borderRadius: 'var(--card-radius, 8px)' }}
          >
            {primaryPages.map(({ name, element, props }) => (
              <div
                key={name}
                className="flex h-full w-full flex-col"
                style={{
                  display: currentPrimaryPage === name ? 'block' : 'none'
                }}
              >
                {props ? cloneElement(element as ReactElement, props) : element}
              </div>
            ))}
          </div>
          <HomePageWrapper
            secondaryStackLength={secondaryStack.length}
            widgetSidebarDismissed={widgetSidebarDismissed}
          >
            {secondaryStack.map((item, index) => (
              <div
                key={item.index}
                className="flex h-full w-full flex-col"
                style={{ display: index === secondaryStack.length - 1 ? 'block' : 'none' }}
              >
                {item.component}
              </div>
            ))}
            {!widgetSidebarDismissed && (
              <div
                key="home"
                className="h-full min-h-0 w-full"
                style={{ display: secondaryStack.length === 0 ? 'block' : 'none' }}
              >
                <HomePage />
              </div>
            )}
          </HomePageWrapper>
        </div>
      )}
      <TooManyRelaysAlertDialog />
      <BackgroundAudio className="fixed bottom-20 right-0 z-50 w-80 overflow-hidden rounded-l-full rounded-r-none border shadow-lg" />
    </div>
  )
}
