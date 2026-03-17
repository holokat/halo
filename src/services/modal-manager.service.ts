class ModalManagerService {
  static instance: ModalManagerService

  private modals: { id: string; cb: () => void }[] = []

  constructor() {
    if (!ModalManagerService.instance) {
      ModalManagerService.instance = this
    }
    return ModalManagerService.instance
  }

  register(id: string, cb: () => void) {
    const modal = this.modals.find((m) => m.id === id)
    if (modal) {
      // already registered, update callback
      modal.cb = cb
      return
    }
    this.modals.push({ id, cb })
  }

  unregister(id: string) {
    this.modals = this.modals.filter((m) => m.id !== id)
  }

  pop() {
    const modal = this.modals[this.modals.length - 1]
    if (!modal) return false

    this.modals = this.modals.slice(0, -1)
    modal.cb()
    return true
  }
}

const instance = new ModalManagerService()
export default instance
