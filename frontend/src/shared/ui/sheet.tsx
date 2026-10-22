import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Боковая панель справа поверх списка: создание, правка и просмотр заявки без ухода со страницы.
 * footer прижат к низу панели — главная кнопка всегда видна.
 */
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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RadixDialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-bg shadow-2xl outline-none',
            'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-3.5">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[17px] font-semibold">{title}</RadixDialog.Title>
              {subtitle ? <RadixDialog.Description className="mt-0.5 text-[13px] text-muted">{subtitle}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="cursor-pointer rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Закрыть">
              <X size={18} />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-border bg-surface px-5 py-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
