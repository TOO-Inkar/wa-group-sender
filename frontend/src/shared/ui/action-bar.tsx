import type { ReactNode } from 'react'

export function ActionBar({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(720px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg motion-safe:animate-rise-in md:bottom-[calc(16px+env(safe-area-inset-bottom))]">
      <span className="text-sm font-semibold">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}
