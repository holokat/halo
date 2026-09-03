import BottomNavigationBar from '@/components/BottomNavigationBar'
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
    <div className="flex h-[var(--vh)] justify-center overflow-hidden bg-surface-background">
      <main className="flex h-full min-h-0 min-w-0 w-full max-w-[736px] flex-1 flex-col">
        <div className="flex h-full min-h-0 w-full flex-1 flex-col px-2 py-2">
          <div
            className={cn(
              'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card',
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
      <BottomNavigationBar />
    </div>
  )
}
