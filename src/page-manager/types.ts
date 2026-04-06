import { type ReactElement, type RefObject } from 'react'
import { type TPageRef } from '@/types'
import { type TPrimaryPageName } from './page-registry'
export type { TPrimaryPageName } from './page-registry'

export type TPrimaryPageContext = {
  navigate: (page: TPrimaryPageName, props?: object) => void
  current: TPrimaryPageName | null
  display: boolean
}

export type TSecondaryPageContext = {
  push: (url: string) => void
  pop: () => void
  clear: () => void
  currentIndex: number
}

export type TStackItem = {
  index: number
  url: string
  component: ReactElement | null
  ref: RefObject<TPageRef> | null
}
