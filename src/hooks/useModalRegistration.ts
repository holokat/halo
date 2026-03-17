import { useEffect, useRef } from 'react'

import modalManager from '@/services/modal-manager.service'

export default function useModalRegistration(id: string, isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      modalManager.unregister(id)
      return
    }

    modalManager.register(id, () => {
      onCloseRef.current()
    })

    return () => {
      modalManager.unregister(id)
    }
  }, [id, isOpen])
}
