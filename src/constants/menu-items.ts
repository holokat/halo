export type TMenuItem =
  | 'home'
  | 'reads'
  | 'lists'
  | 'explore'
  | 'notifications'
  | 'post'
  | 'deck'
  | 'livestreams'

export type TMenuItemConfig = {
  id: TMenuItem
  visible: boolean
  order: number
  canToggle: boolean
  canReorder: boolean
}

export const DEFAULT_MENU_ITEMS: TMenuItemConfig[] = [
  { id: 'home', visible: true, order: 0, canToggle: false, canReorder: true },
  { id: 'reads', visible: false, order: 1, canToggle: true, canReorder: true },
  { id: 'lists', visible: false, order: 2, canToggle: true, canReorder: true },
  { id: 'explore', visible: true, order: 3, canToggle: true, canReorder: true },
  { id: 'notifications', visible: true, order: 4, canToggle: true, canReorder: true },
  { id: 'livestreams', visible: false, order: 5, canToggle: true, canReorder: true },
  { id: 'post', visible: true, order: 6, canToggle: false, canReorder: true },
  { id: 'deck', visible: true, order: 7, canToggle: true, canReorder: false }
]
