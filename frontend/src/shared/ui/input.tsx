import { ChevronDown } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

const control =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text placeholder:text-muted/70 transition-shadow focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none aria-invalid:border-danger'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-11 resize-y', className)} {...props} />
}

export function Select({ className, block, ...props }: ComponentProps<'select'> & { block?: boolean }) {
  return (
    <span className={cn('relative max-w-full', block ? 'flex min-w-0 flex-1' : 'inline-flex')}>
      <select className={cn(control, 'max-w-full cursor-pointer appearance-none pr-9', block ? 'w-full' : 'w-auto', className)} {...props} />
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </span>
  )
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[13px] font-medium text-muted', className)}>{children}</span>
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('grid gap-1.5 text-sm font-semibold', className)}>
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="text-[13px] font-normal text-danger">{error}</span> : hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}
    </label>
  )
}

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('-mx-1.5 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm hover:bg-surface-2', className)}>
      <input type="checkbox" className="size-4 shrink-0 accent-accent" {...props} />
      <span>{label}</span>
    </label>
  )
}
