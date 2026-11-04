import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { FOCUS_RING, TRANSITION } from './styles'

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
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label={label}>
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
              'inline-flex h-control-sm shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm leading-none font-medium whitespace-nowrap',
              TRANSITION,
              FOCUS_RING,
              active ? 'border-accent/60 bg-accent-soft text-text' : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="text-xs leading-none text-muted tabular-nums">{option.count}</span>}
          </button>
        )
      })}
      {after}
    </div>
  )
}
