import { BIG_RELAY_URLS } from '@/constants'
import {
  LiveReactionFountainCoordinator,
  TLiveReactionFountainCoordinatorHandle
} from '@/components/LiveReactionFountain/LiveReactionFountainCoordinator'
import { LiveReactionFountainService } from '@/services/live-reaction-fountain.service'
import storage from '@/services/local-storage.service'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useNostr } from './NostrProvider'

type TLiveReactionFountainContext = {
  reactionFountainEnabled: boolean
  setReactionFountainEnabled: (enabled: boolean) => void
  previewReactionFountain: () => void
}

const LiveReactionFountainContext = createContext<TLiveReactionFountainContext | undefined>(
  undefined
)

export function useLiveReactionFountain() {
  const context = useContext(LiveReactionFountainContext)
  if (!context) {
    throw new Error('useLiveReactionFountain must be used within a LiveReactionFountainProvider')
  }
  return context
}

export function LiveReactionFountainProvider({ children }: { children: ReactNode }) {
  const { pubkey, relayList } = useNostr()
  const coordinatorRef = useRef<TLiveReactionFountainCoordinatorHandle | null>(null)
  const wasAppActiveRef = useRef(isDocumentVisible())
  const [reactionFountainEnabled, setReactionFountainEnabledState] = useState<boolean>(
    storage.getReactionFountainEnabled()
  )
  const [isAppActive, setIsAppActive] = useState(isDocumentVisible)
  const [service] = useState(() => new LiveReactionFountainService())

  const relayUrls = useMemo(() => {
    return relayList?.read.length ? relayList.read : BIG_RELAY_URLS
  }, [relayList])

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsAppActive(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handleVisibilityChange)
    window.addEventListener('pagehide', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handleVisibilityChange)
      window.removeEventListener('pagehide', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    service.updateRuntime({
      enabled: reactionFountainEnabled,
      appActive: isAppActive,
      pubkey,
      relayUrls
    })
  }, [isAppActive, pubkey, reactionFountainEnabled, relayUrls, service])

  useEffect(() => {
    const wasAppActive = wasAppActiveRef.current
    wasAppActiveRef.current = isAppActive

    if (!reactionFountainEnabled || !isAppActive || !pubkey || relayUrls.length === 0) {
      return
    }

    if (wasAppActive) {
      return
    }

    service.revalidate('app foregrounded')
  }, [isAppActive, pubkey, reactionFountainEnabled, relayUrls.length, service])

  useEffect(() => {
    return () => {
      service.dispose()
    }
  }, [service])

  const setReactionFountainEnabled = (enabled: boolean) => {
    setReactionFountainEnabledState(enabled)
    storage.setReactionFountainEnabled(enabled)
  }

  return (
    <LiveReactionFountainContext.Provider
      value={{
        reactionFountainEnabled,
        setReactionFountainEnabled,
        previewReactionFountain: () => {
          coordinatorRef.current?.previewBurst()
        }
      }}
    >
      {children}
      <LiveReactionFountainCoordinator ref={coordinatorRef} service={service} />
    </LiveReactionFountainContext.Provider>
  )
}

function isDocumentVisible() {
  if (typeof document === 'undefined') {
    return true
  }

  return document.visibilityState === 'visible'
}
