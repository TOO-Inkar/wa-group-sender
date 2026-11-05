import { useState } from 'react'

export const PAGE_SIZES = [10, 25, 50, 100] as const

export type PageSize = (typeof PAGE_SIZES)[number]

export const isPageSize = (value: unknown): value is PageSize => PAGE_SIZES.includes(value as PageSize)

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size))

export const clampPage = (page: number, total: number, size: number) => Math.min(Math.max(1, page), pageCount(total, size))

export const pageSlice = <T>(items: T[], page: number, size: number) => items.slice((page - 1) * size, page * size)

export function pageRange(page: number, total: number, size: number) {
  if (!total) return { from: 0, to: 0 }
  return { from: (page - 1) * size + 1, to: Math.min(page * size, total) }
}

export const pageKeepingFirst = (page: number, from: number, to: number) => Math.floor(((page - 1) * from) / to) + 1

const STORAGE_PREFIX = 'wa.pageSize.'

function storedSize(key: string, fallback: PageSize): PageSize {
  try {
    const stored = Number(localStorage.getItem(STORAGE_PREFIX + key))
    return isPageSize(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

function storeSize(key: string, size: PageSize) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(size))
  } catch {
    return
  }
}

export type Paging<T> = {
  page: number
  pages: number
  size: PageSize
  total: number
  visible: T[]
  goTo: (page: number) => void
  setSize: (size: PageSize) => void
}

export function usePaging<T>(items: T[], { key, size: initial, reset = '' }: { key: string; size: PageSize; reset?: string }): Paging<T> {
  const [size, setStoredSize] = useState(() => storedSize(key, initial))
  const [cursor, setCursor] = useState({ page: 1, reset })
  const total = items.length
  const page = clampPage(cursor.reset === reset ? cursor.page : 1, total, size)

  return {
    page,
    pages: pageCount(total, size),
    size,
    total,
    visible: pageSlice(items, page, size),
    goTo: (next) => setCursor({ page: clampPage(next, total, size), reset }),
    setSize: (next) => {
      storeSize(key, next)
      setStoredSize(next)
      setCursor({ page: pageKeepingFirst(page, size, next), reset })
    },
  }
}
