import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { control, FOCUS_RING, TRANSITION } from './styles'

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <span className={cn('relative flex h-control min-w-0 items-center self-start', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(control, 'h-full min-h-0 min-w-0 bg-surface-2 py-0 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className={cn('absolute right-1 grid size-[calc(var(--control-h)-0.5rem)] cursor-pointer place-items-center rounded-md text-muted hover:bg-surface hover:text-text', TRANSITION, FOCUS_RING)}
        >
          <X size={16} />
        </button>
      )}
    </span>
  )
}
