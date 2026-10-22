import type { Campaign, Run } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/badge'
import { groupsCount, intervalText, plural } from '@/shared/lib/format'

type CampaignState = 'sending' | 'waiting' | 'scheduled' | 'done' | 'off'

export const STATE: Record<CampaignState, { text: string; tone: Tone }> = {
  sending: { text: 'Рассылается', tone: 'info' },
  waiting: { text: 'В очереди', tone: 'neutral' },
  scheduled: { text: 'По расписанию', tone: 'ok' },
  done: { text: 'Завершена', tone: 'ok' },
  off: { text: 'Выключена', tone: 'warn' },
}

export const RUN_STATE: Record<Run['status'], { text: string; tone: Tone }> = {
  QUEUED: { text: 'в очереди', tone: 'neutral' },
  SENDING: { text: 'идёт', tone: 'info' },
  DONE: { text: 'отправлена', tone: 'ok' },
  FAILED: { text: 'ошибка', tone: 'bad' },
}

export type CampaignFilter = 'all' | 'active' | 'scheduled' | 'done' | 'off'

export function matchesFilter(c: Campaign, filter: CampaignFilter): boolean {
  const state = campaignState(c)
  if (filter === 'all') return true
  if (filter === 'active') return state === 'sending' || state === 'waiting'
  return state === filter
}

export function matchesQuery(c: Campaign, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || c.title.toLowerCase().includes(q) || c.message.toLowerCase().includes(q)
}

export function campaignState(c: Campaign): CampaignState {
  if (c.current) return c.current.status === 'SENDING' ? 'sending' : 'waiting'
  if (!c.enabled) return c.repeatMode === 'ONCE' && c.lastRunAt ? 'done' : 'off'
  if (c.nextRunAt) return 'scheduled'
  return 'done'
}

type ScheduleLike = Pick<Campaign, 'repeatMode' | 'startTime' | 'endTime' | 'intervalMinutes'> & Partial<Pick<Campaign, 'extraTimes' | 'anyTime'>>

const extra = (c: ScheduleLike) => (c.repeatMode !== 'ONCE' && c.extraTimes?.length ? ` и в ${c.extraTimes.join(', ')}` : '')

export function scheduleText(c: ScheduleLike, windowEnd = ''): string {
  const anyTime = c.anyTime ? ', в том числе вне рабочего окна' : ''
  if (c.repeatMode === 'DAILY') return `каждый день в ${c.startTime}${extra(c)}${anyTime}`
  if (c.repeatMode === 'INTERVAL') return `${intervalText(c.intervalMinutes)} с ${c.startTime} до ${c.endTime ?? windowEnd}${extra(c)}${anyTime}`
  return (c.startTime ? `один раз в ${c.startTime}` : 'один раз') + anyTime
}

export function whereText(c: Campaign): string {
  if (!c.targeted) return 'все активные группы'
  return c.targetLabel ?? groupsCount(c.targets.length)
}

export function percent(run: Run | null | undefined): number {
  const p = run?.progress
  return p && p.total ? Math.round(((p.sent + p.failed + p.skipped) / p.total) * 100) : 0
}

export const waitingShort = (run: Run | null | undefined) => run?.waiting?.split(' — ')[0] ?? null

export function latestRun(c: Campaign): Run | null {
  return c.current ?? c.runs[0] ?? null
}

export function deliveryReason(error: string): string {
  if (/последнее сообщение/.test(error)) return 'последнее сообщение в группе наше — отправим позже'
  if (/group inactive/.test(error)) return 'группа вышла из рассылки'
  if (/error 479/.test(error)) return 'WhatsApp отклонил отправку в эту группу'
  if (/not connected/.test(error)) return 'не было связи с WhatsApp'
  return error
}

export function scheduleShort(c: ScheduleLike, windowEnd = ''): string {
  const more = c.repeatMode !== 'ONCE' && c.extraTimes?.length ? ` + ${c.extraTimes.join(', ')}` : ''
  if (c.repeatMode === 'DAILY') return `ежедневно ${c.startTime}${more}`
  if (c.repeatMode === 'INTERVAL') {
    const h = (c.intervalMinutes ?? 0) / 60
    return `каждые ${String(h).replace('.', ',')} ч, ${c.startTime}–${c.endTime ?? windowEnd}${more}`
  }
  return c.startTime ? `один раз в ${c.startTime}` : 'один раз'
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function dayRuns(c: ScheduleLike, windowEnd: string): string[] {
  if (!c.startTime || c.repeatMode === 'ONCE') return []
  const base = [c.startTime]
  if (c.repeatMode === 'INTERVAL' && c.intervalMinutes) {
    base.length = 0
    for (let m = minutes(c.startTime); m <= minutes(c.endTime ?? windowEnd) && m < 24 * 60; m += c.intervalMinutes) base.push(clock(m))
  }
  return [...new Set([...base, ...(c.extraTimes ?? [])])].sort()
}

export function runsText(times: string[]): string {
  const list = times.length <= 6 ? times.join(', ') : `${times.slice(0, 3).join(', ')} … ${times.at(-1)}`
  return `${list} — ${plural(times.length, 'запуск', 'запуска', 'запусков')} в день`
}

// Честная оценка: лимиты общие для номера, а повтор пропускается, пока прошлая рассылка ещё идёт.
export function loadWarnings({ times, groups, hourlyLimit, dailyLimit }: { times: string[]; groups: number; hourlyLimit: number; dailyLimit: number }): string[] {
  const runs = times.length
  if (!runs || !groups) return []
  const warnings: string[] = []
  const hours = hourlyLimit ? groups / hourlyLimit : 0
  const gap = Math.min(...times.slice(1).map((t, i) => minutes(t) - minutes(times[i]!)))
  if (hours * 60 > gap) {
    warnings.push(`Одна рассылка на ${groupsCount(groups)} идёт ≈ ${String(Math.round(hours * 10) / 10).replace('.', ',')} ч (лимит ${hourlyLimit} в час) — запуски, пока она идёт, пропускаются.`)
  }
  if (dailyLimit && groups * runs > dailyLimit) {
    const full = Math.floor(dailyLimit / groups)
    warnings.push(`Дневного лимита ${dailyLimit} хватит на ${plural(full, 'полную рассылку', 'полные рассылки', 'полных рассылок')} из ${runs}.`)
  }
  return warnings
}
