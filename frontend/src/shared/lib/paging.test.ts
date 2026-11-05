import { describe, expect, it } from 'vitest'
import { clampPage, isPageSize, pageCount, pageKeepingFirst, pageRange, pageSlice } from './paging'

const items = Array.from({ length: 246 }, (_, i) => i + 1)

describe('paging', () => {
  it('counts at least one page', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(246, 25)).toBe(10)
    expect(pageCount(1000, 100)).toBe(10)
  })

  it('clamps the page into the existing range', () => {
    expect(clampPage(0, 246, 25)).toBe(1)
    expect(clampPage(4, 246, 25)).toBe(4)
    expect(clampPage(12, 246, 25)).toBe(10)
    expect(clampPage(10, 30, 25)).toBe(2)
    expect(clampPage(3, 0, 25)).toBe(1)
  })

  it('slices one page of items', () => {
    expect(pageSlice(items, 1, 25)).toEqual(items.slice(0, 25))
    expect(pageSlice(items, 10, 25)).toEqual([226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246])
  })

  it('describes the visible range', () => {
    expect(pageRange(1, 246, 25)).toEqual({ from: 1, to: 25 })
    expect(pageRange(10, 246, 25)).toEqual({ from: 226, to: 246 })
    expect(pageRange(1, 0, 25)).toEqual({ from: 0, to: 0 })
  })

  it('keeps the first visible item when the page size changes', () => {
    expect(pageKeepingFirst(3, 25, 100)).toBe(1)
    expect(pageKeepingFirst(5, 25, 100)).toBe(2)
    expect(pageKeepingFirst(2, 100, 10)).toBe(11)
  })

  it('accepts only known page sizes', () => {
    expect(isPageSize(25)).toBe(true)
    expect(isPageSize(30)).toBe(false)
    expect(isPageSize('25')).toBe(false)
  })
})
