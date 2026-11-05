import { ChevronDown } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { control, FOCUS_WITHIN_RING } from './styles'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-16 resize-y py-2', className)} {...props} />
}

export function Select({ className, block, end, ...props }: ComponentProps<'select'> & { block?: boolean; end?: ReactNode }) {
  if (end)
    return (
      <label className={cn(control, FOCUS_WITHIN_RING, 'flex max-w-full min-w-0 cursor-pointer items-center gap-2 py-0 pr-2.5 pl-3', block ? 'flex-auto' : 'sm:w-fit')}>
        <select className={cn('min-w-0 flex-1 cursor-pointer appearance-none self-stretch truncate bg-transparent outline-none', className)} {...props} />
        <span className="pointer-events-none flex shrink-0 items-center gap-2">
          {end}
          <ChevronDown size={16} aria-hidden className="text-muted" />
        </span>
      </label>
    )
  return (
    <span className={cn('relative flex max-w-full min-w-0 items-center', block ? 'flex-auto' : 'w-full sm:w-fit')}>
      <select className={cn(control, 'w-full cursor-pointer appearance-none pr-9', !block && 'sm:min-w-48', className)} {...props} />
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-2.5 text-muted" />
    </span>
  )
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-caption font-medium text-muted', className)}>{children}</span>
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
    <label className={cn('grid gap-1.5 text-sm font-medium', className)}>
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="text-caption font-normal text-danger">{error}</span> : hint && <span className="text-caption font-normal text-muted">{hint}</span>}
    </label>
  )
}

export function CheckboxInput({ indeterminate, className, ...props }: Omit<ComponentProps<'input'>, 'type'> & { indeterminate?: boolean }) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-default', className)}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !props.checked
      }}
      {...props}
    />
  )
}

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: ReactNode; indeterminate?: boolean }) {
  return (
    <label className={cn('-mx-1.5 flex min-h-control-sm cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm transition-colors duration-150 hover:bg-surface-2', className)}>
      <CheckboxInput {...props} />
      <span>{label}</span>
    </label>
  )
}
