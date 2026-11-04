import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('keeps a text colour next to the caption font size', () => {
    expect(cn('text-accent', 'text-caption')).toBe('text-accent text-caption')
  })

  it('lets a later control height win', () => {
    expect(cn('min-h-control', 'min-h-control-sm')).toBe('min-h-control-sm')
    expect(cn('size-control', 'size-8')).toBe('size-8')
  })
})
