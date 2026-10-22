import type { Campaign, Run } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/badge'
import { groupsCount, intervalText } from '@/shared/lib/format'

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

export function scheduleText(c: Pick<Campaign, 'repeatMode' | 'startTime' | 'endTime' | 'intervalMinutes'>, windowEnd = ''): string {
  if (c.repeatMode === 'DAILY') return `каждый день в ${c.startTime}`
  if (c.repeatMode === 'INTERVAL') return `${intervalText(c.intervalMinutes)} с ${c.startTime} до ${c.endTime ?? windowEnd}`
  return c.startTime ? `один раз в ${c.startTime}` : 'один раз'
}

export function whereText(c: Campaign): string {
  if (!c.targeted) return 'все активные группы'
  return c.targetLabel ?? groupsCount(c.targets.length)
}

export function percent(run: Run | null | undefined): number {
  const p = run?.progress
  return p && p.total ? Math.round(((p.sent + p.failed + p.skipped) / p.total) * 100) : 0
}

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

export function scheduleShort(c: Pick<Campaign, 'repeatMode' | 'startTime' | 'endTime' | 'intervalMinutes'>, windowEnd = ''): string {
  if (c.repeatMode === 'DAILY') return `ежедневно ${c.startTime}`
  if (c.repeatMode === 'INTERVAL') {
    const h = (c.intervalMinutes ?? 0) / 60
    return `каждые ${String(h).replace('.', ',')} ч, ${c.startTime}–${c.endTime ?? windowEnd}`
  }
  return c.startTime ? `один раз в ${c.startTime}` : 'один раз'
}
