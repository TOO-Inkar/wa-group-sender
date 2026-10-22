import { cn } from '@/shared/lib/cn'

/** Знак сервиса: одно сообщение расходится по группам. Тот же рисунок — в public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <path d="M16 3C8.8 3 3 8.4 3 15c0 2.5.8 4.8 2.2 6.7L4 28l6.6-1.9c1.6.6 3.5 1 5.4 1 7.2 0 13-5.4 13-12S23.2 3 16 3Z" fill="var(--accent)" />
      <circle cx="11" cy="15.5" r="2" fill="var(--accent-text)" />
      <path d="M13 15.5h3.2M16.2 15.5l4-4.2M16.2 15.5h5.6M16.2 15.5l4 4.2" stroke="var(--accent-text)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="21" cy="10.6" r="1.6" fill="var(--accent-text)" />
      <circle cx="22.6" cy="15.5" r="1.6" fill="var(--accent-text)" />
      <circle cx="21" cy="20.4" r="1.6" fill="var(--accent-text)" />
    </svg>
  )
}
