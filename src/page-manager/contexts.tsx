import {
  createContext,
  useContext
} from 'react'
import { type TPrimaryPageContext, type TSecondaryPageContext } from './types'

export const PrimaryPageContext = createContext<TPrimaryPageContext | undefined>(undefined)
export const SecondaryPageContext = createContext<TSecondaryPageContext | undefined>(undefined)

export function usePrimaryPage() {
  const context = useContext(PrimaryPageContext)
  if (!context) {
    throw new Error('usePrimaryPage must be used within a PrimaryPageContext.Provider')
  }
  return context
}

export function useSecondaryPage() {
  const context = useContext(SecondaryPageContext)
  if (!context) {
    throw new Error('useSecondaryPage must be used within a SecondaryPageContext.Provider')
  }
  return context
}
