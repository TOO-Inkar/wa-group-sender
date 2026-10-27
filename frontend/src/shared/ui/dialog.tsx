import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { focusSelf } from './focus'
import { FOCUS_RING } from './styles'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  toolbar,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          tabIndex={-1}
          onOpenAutoFocus={focusSelf}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none',
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-[480px]',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            <div className="grid min-w-0 gap-1">
              <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className={cn('-mt-1.5 -mr-1.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text', FOCUS_RING)} aria-label="Закрыть">
              <X size={18} />
            </RadixDialog.Close>
          </div>
          {toolbar && <div className="grid shrink-0 gap-2 border-b border-border px-4 pt-3 pb-2 sm:px-5">{toolbar}</div>}
          <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:pb-5">
            <div className="grid gap-3">{children}</div>
          </div>
          {footer && <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
}
