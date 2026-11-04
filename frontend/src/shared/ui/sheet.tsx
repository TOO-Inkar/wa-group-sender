import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { focusSelf } from './focus'
import { FOCUS_RING, TRANSITION } from './styles'

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-3xl',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay motion-safe:animate-fade-in" />
        <RadixDialog.Content
          tabIndex={-1}
          onOpenAutoFocus={focusSelf}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-bg shadow-xl outline-none motion-safe:animate-slide-in',
            'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <RadixDialog.Title className="line-clamp-2 text-lg font-semibold">{title}</RadixDialog.Title>
              {subtitle ? <RadixDialog.Description className="mt-0.5 text-caption text-muted">{subtitle}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className={cn('-mr-2 grid size-control-sm shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text', TRANSITION, FOCUS_RING)} aria-label="Закрыть">
              <X size={18} />
            </RadixDialog.Close>
          </div>
          <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
          {footer && <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
