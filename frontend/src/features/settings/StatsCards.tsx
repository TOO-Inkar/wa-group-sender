import { useHealth } from '@/features/health/api'
import { Card } from '@/shared/ui/card'

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <Card>
      <div className="text-xs tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{value}</div>
      <div className="text-[13px] text-muted">{note}</div>
    </Card>
  )
}

export function StatsCards() {
  const { data: h } = useHealth()
  if (!h) return null
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      <Stat label="Отправлено сегодня" value={h.sentToday} note={h.warmupLimitToday == null ? 'без лимита' : `из ${h.warmupLimitToday}, день прогрева ${h.warmupDay}`} />
      <Stat label="За последний час" value={h.sentLastHour} note={h.hourlyLimit ? `из ${h.hourlyLimit} в час` : 'без лимита в час'} />
      <Stat label="Рассылок в работе" value={h.queueLength} note="идут или ждут" />
      <Stat label="Групп в рассылке" value={h.activeGroups} note="в архиве и можно писать" />
      <Stat label="Сигналы риска" value={h.riskEventsInWindow} note={h.stoppedByRisk ? 'рассылка остановлена' : `паузы ×${h.pauseMultiplier}`} />
    </div>
  )
}
