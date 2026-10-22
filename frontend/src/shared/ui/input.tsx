import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

const control =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text placeholder:text-muted/70 focus-visible:border-accent aria-invalid:border-danger'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-11 resize-y', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'w-auto', className)} {...props} />
}

/** Подпись, поле, подсказка и ошибка одним блоком. */
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
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input type="checkbox" className="size-4 accent-accent" {...props} />
      <span>{label}</span>
    </label>
  )
}
