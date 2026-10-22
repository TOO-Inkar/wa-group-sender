import type { ReactNode } from 'react'

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center text-muted">
      <div>{children}</div>
      {action}
    </div>
  )
}
