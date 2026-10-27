import { useHealth } from '@/features/health/api'
import { useSettings } from './api'
import { cn } from '@/shared/lib/cn'

function Stat({ label, value, note, alert, className }: { label: string; value: number | string; note: string; alert?: boolean; className?: string }) {
  return (
    <div className={cn('grid content-start gap-0.5 bg-surface px-4 py-3', className)}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cn('text-2xl leading-tight font-semibold tabular-nums', alert && 'text-bad-text')}>{value}</dd>
      <dd className="text-[13px] text-muted">{note}</dd>
    </div>
  )
}

export function StatsCards() {
  const { data: h } = useHealth()
  const { data: settings } = useSettings()
  if (!h) return null
  // Одна полоса цифр вместо пяти плиток: разделители — это 1px фона между ячейками.
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Отправлено сегодня" value={h.sentToday} note={h.warmupLimitToday == null ? 'без лимита' : settings?.warmupEnabled ? `из ${h.warmupLimitToday}, день прогрева ${h.warmupDay}` : `из ${h.warmupLimitToday} в день`} />
      <Stat label="За последний час" value={h.sentLastHour} note={h.hourlyLimit ? `из ${h.hourlyLimit} в час` : 'без лимита в час'} />
      <Stat label="Рассылок в работе" value={h.queueLength} note="идут или ждут" />
      <Stat label="Групп в рассылке" value={h.activeGroups} note="в архиве и можно писать" />
      <Stat label="Сигналы риска" value={h.riskEventsInWindow} note={h.stoppedByRisk ? 'рассылка остановлена' : `паузы ×${h.pauseMultiplier}`} alert={h.stoppedByRisk || h.riskEventsInWindow > 0} className="col-span-2 sm:col-span-1" />
    </dl>
  )
}
