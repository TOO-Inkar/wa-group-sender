import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { whatsappToHtml } from '@/shared/lib/whatsapp'

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-neutral-bg', className)}>
      <span className="block h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  )
}

/** Сообщение так, как его увидят в WhatsApp: зелёный пузырь на фоне чата. */
export function WhatsAppBubble({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-chat-bg p-4', className)}>
      <div
        className="ml-auto w-fit max-w-[92%] rounded-xl rounded-tr-sm bg-bubble px-2.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap text-bubble-text shadow-sm [overflow-wrap:anywhere] [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: whatsappToHtml(text) }}
      />
    </div>
  )
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center text-muted">
      <div>{children}</div>
      {action}
    </div>
  )
}

export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-tight font-semibold">{title}</h1>
        {lead && <p className="text-sm text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="my-2.5 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'cursor-pointer rounded-full border px-3 py-1 text-[13px]',
            option.value === value ? 'border-transparent bg-accent-soft font-semibold text-ok-text' : 'border-border bg-surface text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
