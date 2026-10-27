import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <span className={cn('relative flex min-w-0', className)}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-2 pr-10 pl-9 text-[15px] text-text transition-shadow placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted hover:bg-surface hover:text-text focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none"
        >
          <X size={16} />
        </button>
      )}
    </span>
  )
}
