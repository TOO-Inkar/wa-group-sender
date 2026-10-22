import { useHealth } from './api'
import { dispatcherInfo } from './texts'
import { cn } from '@/shared/lib/cn'
import { Dot } from '@/shared/ui/badge'

export function StatusChip({ className }: { className?: string }) {
  const { data: h, isError } = useHealth()
  if (isError || !h) {
    return (
      <span className={cn('flex items-center gap-1.5 text-[13px] text-bad-text', className)}>
        <Dot tone="bad" />
        нет связи
      </span>
    )
  }
  const info = h.session === 'CONNECTED' ? dispatcherInfo(h.dispatcher) : { short: 'номер не подключён', tone: 'bad' as const, hint: undefined }
  const extra =
    h.dispatcher === 'daily-limit-reached' ? ` ${h.sentToday}/${h.warmupLimitToday ?? '—'}` : h.dispatcher === 'hourly-limit-reached' ? ` ${h.sentLastHour}/${h.hourlyLimit}` : ''
  return (
    <span title={info.hint} className={cn('flex items-start gap-1.5 text-[13px] leading-snug text-muted', className)}>
      <span className="mt-[5px] flex"><Dot tone={info.tone} /></span>
      <span>
        {info.short}
        {extra}
      </span>
    </span>
  )
}
