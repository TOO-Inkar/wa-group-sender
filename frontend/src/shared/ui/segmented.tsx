import { cn } from '@/shared/lib/cn'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex max-w-full flex-wrap gap-0.5 rounded-xl bg-surface-2 p-0.5', className)}>
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
              'inline-flex cursor-pointer items-center gap-1.5 rounded-lg whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-1.5 text-sm',
              active ? 'bg-surface font-semibold text-text shadow-sm' : 'text-muted hover:text-text',
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
