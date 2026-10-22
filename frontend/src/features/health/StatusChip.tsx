import { useHealth } from './api'
import { cn } from '@/shared/lib/cn'

const SHORT: Record<string, { text: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  running: { text: 'идёт рассылка', tone: 'ok' },
  idle: { text: 'ждёт заявок', tone: 'info' },
  'waiting-groups': { text: 'пауза в группах', tone: 'info' },
  'outside-window': { text: 'вне рабочего окна', tone: 'info' },
  'daily-limit-reached': { text: 'дневной лимит', tone: 'info' },
  'hourly-limit-reached': { text: 'лимит в час', tone: 'info' },
  'no-active-groups': { text: 'нет групп', tone: 'warn' },
  'waiting-session': { text: 'подключение…', tone: 'warn' },
  paused: { text: 'на паузе', tone: 'warn' },
  'stopped-by-risk': { text: 'остановлена', tone: 'bad' },
  starting: { text: 'запуск', tone: 'info' },
  stopped: { text: 'остановлена', tone: 'bad' },
}

const HINT: Record<string, string> = {
  'waiting-groups': 'В оставшихся группах последнее сообщение наше — отправим, когда там напишут или пройдёт пауза',
  'outside-window': 'Продолжится, когда откроется рабочее окно',
  'daily-limit-reached': 'Продолжится завтра',
  'hourly-limit-reached': 'Продолжится в течение часа',
}

const dot = { ok: 'bg-accent', info: 'bg-info-text', warn: 'bg-[#e0a030]', bad: 'bg-danger' }

/** Состояние номера и рассылки одной строкой: подсказка — при наведении. */
export function StatusChip({ className }: { className?: string }) {
  const { data: h, isError } = useHealth()
  if (isError || !h) return <span className={cn('flex items-center gap-1.5 text-[13px] text-bad-text', className)}><span className="size-2 rounded-full bg-danger" />нет связи</span>
  const linked = h.session === 'CONNECTED'
  const state = linked ? (SHORT[h.dispatcher] ?? { text: h.dispatcher, tone: 'info' as const }) : { text: 'номер не подключён', tone: 'bad' as const }
  const extra = h.dispatcher === 'daily-limit-reached' ? ` ${h.sentToday}/${h.warmupLimitToday ?? '—'}` : h.dispatcher === 'hourly-limit-reached' ? ` ${h.sentLastHour}/${h.hourlyLimit}` : ''
  return (
    <span title={HINT[h.dispatcher] ?? ''} className={cn('flex items-center gap-1.5 text-[13px] text-muted', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', dot[state.tone])} />
      <span className="truncate">
        {state.text}
        {extra}
      </span>
    </span>
  )
}
