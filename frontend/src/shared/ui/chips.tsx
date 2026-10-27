import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { FOCUS_RING } from './styles'

export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  after,
}: {
  label: string
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (value: T) => void
  after?: ReactNode
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors',
              FOCUS_RING,
              active ? 'border-accent bg-accent-soft font-semibold text-text' : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="text-xs text-muted tabular-nums">{option.count}</span>}
          </button>
        )
      })}
      {after}
    </div>
  )
}
