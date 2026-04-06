import { cloneElement, createRef } from 'react'
import { routes } from '@/routes'
import { type TStackItem } from './types'
import { type TPageRef } from '@/types'

export function isCurrentPage(stack: TStackItem[], url: string) {
  const currentPage = stack[stack.length - 1]
  if (!currentPage) return false

  return currentPage.url === url
}

export function findAndCreateComponent(url: string | undefined, index: number) {
  if (!url) return {}
  const path = url.split('?')[0].split('#')[0]
  for (const { matcher, element } of routes) {
    const match = matcher(path)
    if (!match) continue

    if (!element) return {}
    const ref = createRef<TPageRef>()
    return { component: cloneElement(element, { ...match.params, index, ref } as any), ref }
  }
  return {}
}

export function pushNewPageToStack(
  stack: TStackItem[],
  url: string | undefined,
  maxStackSize = 5,
  specificIndex?: number
) {
  if (!url) return { newStack: stack, newItem: null }

  const currentItem = stack[stack.length - 1]
  const currentIndex = specificIndex ?? (currentItem ? currentItem.index + 1 : 0)

  const { component, ref } = findAndCreateComponent(url, currentIndex)
  if (!component) return { newStack: stack, newItem: null }

  const newItem = { component, ref, url, index: currentIndex }
  const newStack = [...stack, newItem]
  const lastCachedIndex = newStack.findIndex((item) => item.component)
  if (newStack.length - lastCachedIndex > maxStackSize) {
    newStack[lastCachedIndex].component = null
  }
  return { newStack, newItem }
}
