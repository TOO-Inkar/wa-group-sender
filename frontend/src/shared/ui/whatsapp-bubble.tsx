import { cn } from '@/shared/lib/cn'
import { whatsappToHtml } from '@/shared/lib/whatsapp'

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
