import { cn } from '@/shared/lib/cn'
import { FOCUS_RING } from './styles'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  stretch,
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (value: T) => void
  className?: string
  stretch?: boolean
}) {
  return (
    <div role="radiogroup" className={cn('max-w-full flex-wrap gap-0.5 rounded-xl bg-surface-2 p-0.5', stretch ? 'flex w-full' : 'inline-flex', className)}>
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
              'inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors',
              FOCUS_RING,
              stretch && 'flex-auto',
              active ? 'bg-surface font-semibold text-text shadow-sm ring-1 ring-border' : 'text-muted hover:text-text',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className={cn('text-xs tabular-nums', active ? 'text-muted' : 'text-muted/70')}>{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
