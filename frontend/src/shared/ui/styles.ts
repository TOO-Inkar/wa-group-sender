import { cva } from 'class-variance-authority'

export const FOCUS_RING = 'focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none'

export const TRANSITION = 'transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-out'

export const control = `min-h-control w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-muted ${TRANSITION} hover:border-muted/40 focus-visible:border-accent ${FOCUS_RING} aria-invalid:border-danger disabled:cursor-default disabled:opacity-55`

export const buttonVariants = cva(
  `inline-flex min-h-control items-center justify-center gap-1.5 rounded-lg font-medium [&_svg]:shrink-0 ${TRANSITION} disabled:cursor-default disabled:opacity-55 cursor-pointer ${FOCUS_RING}`,
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-text hover:enabled:bg-accent-hover',
        secondary: 'border border-border bg-surface text-text hover:enabled:bg-surface-2',
        ghost: 'text-muted hover:enabled:text-text hover:enabled:bg-surface-2',
        danger: 'text-danger hover:enabled:bg-bad-bg',
        link: 'text-accent hover:enabled:underline underline-offset-2',
      },
      size: {
        sm: 'min-h-control-sm px-2.5 text-caption',
        md: 'px-3 text-sm',
        lg: 'px-4 text-sm',
        inline: 'px-0 text-caption',
        icon: 'size-control p-0 text-muted hover:enabled:bg-surface-2 hover:enabled:text-text',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
