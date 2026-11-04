import { cn } from '@/shared/lib/cn'
import { fitsPhoneRow, type SegmentOption } from './segmented-layout'
import { FOCUS_RING, TRANSITION } from './styles'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  stretch,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
  stretch?: boolean
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'max-w-full gap-0.5 rounded-lg bg-surface-2 p-0.5',
        !stretch && 'inline-flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        stretch && (fitsPhoneRow(options) ? 'flex w-full' : 'grid w-full grid-cols-2 lg:flex'),
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
              stretch ? 'flex-[1_0_0%] max-lg:odd:last:col-span-2' : 'shrink-0',
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
