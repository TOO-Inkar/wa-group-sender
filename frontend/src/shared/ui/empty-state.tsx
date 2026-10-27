import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export function EmptyState({ children, action, inset }: { children: ReactNode; action?: ReactNode; inset?: boolean }) {
  return (
    <div className={cn('grid justify-items-center gap-3 px-4 text-center text-muted', inset ? 'py-8' : 'rounded-xl border border-dashed border-border py-10')}>
      <div>{children}</div>
      {action}
    </div>
  )
}
