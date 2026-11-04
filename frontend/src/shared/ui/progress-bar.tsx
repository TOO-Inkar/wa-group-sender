import { cn } from '@/shared/lib/cn'

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-neutral-bg', className)}>
      <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
    </div>
  )
}
