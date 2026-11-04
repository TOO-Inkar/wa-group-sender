import { cn } from '@/shared/lib/cn'
import { FOCUS_RING, TRANSITION } from './styles'

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
    <div
      role="radiogroup"
      className={cn(
        'max-w-full gap-0.5 overflow-x-auto overscroll-x-contain rounded-lg bg-surface-2 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        stretch ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
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
              'inline-flex h-control-sm cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm leading-none font-medium whitespace-nowrap',
              TRANSITION,
              FOCUS_RING,
              stretch ? 'flex-[1_0_0%]' : 'shrink-0',
              active ? 'bg-raised text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="text-xs leading-none text-muted tabular-nums">{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
