import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { focusSelf } from './focus'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  sheetOnPhone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  sheetOnPhone?: boolean
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          tabIndex={-1}
          onOpenAutoFocus={focusSelf}
          className={cn(
            'fixed z-50 flex max-h-[90dvh] flex-col overflow-hidden border border-border bg-surface shadow-2xl outline-none',
            'top-1/2 left-1/2 w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl',
            wide ? 'max-w-2xl' : 'max-w-[480px]',
            sheetOnPhone && 'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]',
          )}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            <div className="grid min-w-0 gap-1">
              <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              className="-mt-1.5 -mr-1.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none"
              aria-label="Закрыть"
            >
              <X size={18} />
            </RadixDialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pt-3 pb-4 sm:px-5 sm:pb-5">{children}</div>
          {footer && <div className="border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>
}
