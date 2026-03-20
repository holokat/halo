import { DEFAULT_MENU_ITEMS, TMenuItemConfig } from '@/constants/menu-items'

const DEFAULT_MENU_ITEM_IDS = DEFAULT_MENU_ITEMS.map((item) => item.id)
const DEFAULT_MENU_ITEM_IDS_WITHOUT_MESSAGES = DEFAULT_MENU_ITEM_IDS.filter(
  (id) => id !== 'messages'
)

function sortMenuItems(menuItems: TMenuItemConfig[]) {
  return [...menuItems].sort((a, b) => a.order - b.order)
}

function normalizeMenuItemOrders(menuItems: TMenuItemConfig[]) {
  return menuItems.map((item, index) => ({ ...item, order: index }))
}

function getInsertionIndex(menuItemIds: TMenuItemConfig['id'][], targetId: TMenuItemConfig['id']) {
  const defaultIndex = DEFAULT_MENU_ITEM_IDS.indexOf(targetId)

  for (let index = defaultIndex - 1; index >= 0; index -= 1) {
    const previousItemIndex = menuItemIds.indexOf(DEFAULT_MENU_ITEM_IDS[index])
    if (previousItemIndex !== -1) {
      return previousItemIndex + 1
    }
  }

  for (let index = defaultIndex + 1; index < DEFAULT_MENU_ITEM_IDS.length; index += 1) {
    const nextItemIndex = menuItemIds.indexOf(DEFAULT_MENU_ITEM_IDS[index])
    if (nextItemIndex !== -1) {
      return nextItemIndex
    }
  }

  return menuItemIds.length
}

export function mergeMenuItemsWithDefaults(storedMenuItems: TMenuItemConfig[]): TMenuItemConfig[] {
  const mergedMenuItems = sortMenuItems(
    storedMenuItems.filter((item) => DEFAULT_MENU_ITEM_IDS.includes(item.id))
  )
  const storedIds = mergedMenuItems.map((item) => item.id)
  const missingItems = DEFAULT_MENU_ITEMS.filter(
    (defaultItem) => !storedIds.includes(defaultItem.id)
  )

  if (missingItems.length === 0) {
    return mergedMenuItems
  }

  missingItems.forEach((item) => {
    const insertionIndex = getInsertionIndex(
      mergedMenuItems.map((menuItem) => menuItem.id),
      item.id
    )
    mergedMenuItems.splice(insertionIndex, 0, item)
  })

  return normalizeMenuItemOrders(mergedMenuItems)
}

export function migrateLegacyMessagesMenuPosition(menuItems: TMenuItemConfig[]) {
  const sortedMenuItems = sortMenuItems(menuItems)
  const menuItemIds = sortedMenuItems.map((item) => item.id)
  const idsWithoutMessages = menuItemIds.filter((id) => id !== 'messages')

  const hasLegacyAppendedMessagesPosition =
    menuItemIds[menuItemIds.length - 1] === 'messages' &&
    idsWithoutMessages.length === DEFAULT_MENU_ITEM_IDS_WITHOUT_MESSAGES.length &&
    idsWithoutMessages.every((id, index) => id === DEFAULT_MENU_ITEM_IDS_WITHOUT_MESSAGES[index])

  if (!hasLegacyAppendedMessagesPosition) {
    return sortedMenuItems
  }

  const messageItem = sortedMenuItems.find((item) => item.id === 'messages')
  const notificationIndex = sortedMenuItems.findIndex((item) => item.id === 'notifications')

  if (!messageItem || notificationIndex === -1) {
    return sortedMenuItems
  }

  const menuItemsWithoutMessages = sortedMenuItems.filter((item) => item.id !== 'messages')
  menuItemsWithoutMessages.splice(notificationIndex + 1, 0, messageItem)

  return normalizeMenuItemOrders(menuItemsWithoutMessages)
}

export function getDefaultMenuItems(): TMenuItemConfig[] {
  return DEFAULT_MENU_ITEMS
}
