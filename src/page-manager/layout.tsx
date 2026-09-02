import BackgroundAudio from '@/components/BackgroundAudio'
import BottomNavigationBar from '@/components/BottomNavigationBar'
import Sidebar from '@/components/Sidebar'
import { cn } from '@/lib/utils'
import { cloneElement, type ReactElement, type ReactNode } from 'react'
import { type TPrimaryPageName, type TStackItem } from './types'

type TPrimaryPageEntry = {
  name: TPrimaryPageName
  element: ReactNode
  props?: any
}

export function PageManagerShell({
  isSmallScreen,
  pageTheme,
  primaryPages,
  currentPrimaryPage,
  secondaryStack
}: {
  isSmallScreen: boolean
  pageTheme: string
  primaryPages: TPrimaryPageEntry[]
  currentPrimaryPage: TPrimaryPageName
  secondaryStack: TStackItem[]
}) {
  if (isSmallScreen) {
    return (
      <div>
        {secondaryStack.map((item, index) => (
          <div
            key={item.index}
            style={{ display: index === secondaryStack.length - 1 ? 'block' : 'none' }}
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
      </div>
    )
  }

  const isShowingSecondaryPage = secondaryStack.length > 0

  return (
    <div className="h-[var(--vh)] overflow-hidden bg-surface-background">
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-20 shrink-0 border-r border-border/70 bg-background',
          pageTheme === 'pure-black' && 'border-neutral-900'
        )}
      >
        <Sidebar />
      </div>

      <main className="h-full min-w-0 pl-16 xl:pl-52">
        <div className="mx-auto h-full w-full max-w-[736px] px-2 py-2">
          <div
            className={cn(
              'h-full min-h-0 min-w-0 overflow-hidden bg-card',
              pageTheme === 'pure-black' && 'border border-neutral-900',
              pageTheme === 'white' ? 'border border-border' : 'shadow-lg'
            )}
            style={{ borderRadius: 'var(--card-radius, 8px)' }}
          >
            {secondaryStack.map((item, index) => (
              <div
                key={item.index}
                className="h-full w-full"
                style={{
                  display:
                    isShowingSecondaryPage && index === secondaryStack.length - 1 ? 'block' : 'none'
                }}
              >
                {item.component}
              </div>
            ))}

            {primaryPages.map(({ name, element, props }) => (
              <div
                key={name}
                className="h-full w-full"
                style={{
                  display: !isShowingSecondaryPage && currentPrimaryPage === name ? 'block' : 'none'
                }}
              >
                {props ? cloneElement(element as ReactElement, props) : element}
              </div>
            ))}
          </div>
        </div>
      </main>

      <BackgroundAudio className="fixed bottom-5 right-0 z-50 w-80 overflow-hidden rounded-l-full rounded-r-none border shadow-lg" />
    </div>
  )
}
