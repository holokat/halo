import { useCallback, useEffect, useRef } from 'react'

export default function useDeferredAction() {
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  return useCallback((action: () => void) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      action()
    })
  }, [])
}
