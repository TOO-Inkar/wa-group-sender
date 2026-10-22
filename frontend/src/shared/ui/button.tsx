import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-default disabled:opacity-55 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-text font-semibold hover:enabled:bg-accent-hover',
        secondary: 'border border-border bg-surface hover:enabled:bg-surface-2',
        ghost: 'text-muted hover:enabled:text-text',
        danger: 'text-danger hover:enabled:bg-bad-bg',
      },
      size: {
        sm: 'px-2.5 py-1 text-[13px]',
        md: 'px-3.5 py-2 text-sm',
        lg: 'px-5 py-2.5 text-[15px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />
}
