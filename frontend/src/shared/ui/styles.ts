import { cva } from 'class-variance-authority'

export const FOCUS_RING = 'focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none'

export const control = `min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text placeholder:text-muted transition-shadow focus-visible:border-accent ${FOCUS_RING} aria-invalid:border-danger`

export const buttonVariants = cva(
  `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-default disabled:opacity-55 cursor-pointer ${FOCUS_RING}`,
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-text font-semibold hover:enabled:bg-accent-hover',
        secondary: 'border border-border bg-surface hover:enabled:bg-surface-2',
        ghost: 'text-muted hover:enabled:text-text hover:enabled:bg-surface-2',
        danger: 'text-danger hover:enabled:bg-bad-bg',
        link: 'text-accent hover:enabled:underline',
      },
      size: {
        sm: 'px-3 text-[13px]',
        md: 'px-3.5 text-sm',
        lg: 'min-h-11 px-5 text-[15px]',
        inline: 'px-0 text-[13px]',
        icon: 'size-10 shrink-0 p-0 text-muted hover:enabled:bg-surface-2 hover:enabled:text-text',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
