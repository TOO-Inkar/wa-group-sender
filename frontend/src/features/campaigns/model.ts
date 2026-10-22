import type { Campaign, Run } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/badge'
import { formatTime, intervalText, plural } from '@/shared/lib/format'

export type CampaignState = 'sending' | 'waiting' | 'scheduled' | 'done' | 'off'

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

export function campaignState(c: Campaign): CampaignState {
  if (c.current) return c.current.status === 'SENDING' ? 'sending' : 'waiting'
  if (!c.enabled) return c.repeatMode === 'ONCE' && c.lastRunAt ? 'done' : 'off'
  if (c.nextRunAt) return 'scheduled'
  return 'done'
}

/** «каждый день в 05:00», «каждые 2 часа с 08:00 до 23:00», «один раз». */
export function scheduleText(c: Pick<Campaign, 'repeatMode' | 'startTime' | 'endTime' | 'intervalMinutes'>, windowEnd = ''): string {
  if (c.repeatMode === 'DAILY') return `каждый день в ${c.startTime}`
  if (c.repeatMode === 'INTERVAL') return `${intervalText(c.intervalMinutes)} с ${c.startTime} до ${c.endTime ?? windowEnd}`
  return c.startTime ? `один раз в ${c.startTime}` : 'один раз'
}

/** Кому: название списка групп, названия групп или все активные. */
export function whereText(c: Campaign): string {
  if (!c.targeted) return 'все активные группы'
  return c.targetLabel ?? plural(c.targets.length, 'группа', 'группы', 'групп')
}

export function progressText(run: Run | null | undefined): string {
  if (!run) return 'ещё не начата'
  const p = run.progress
  if (!p.total) return run.status === 'FAILED' ? (run.error ?? 'ошибка') : 'ещё не начата'
  return `отправлено ${p.sent} из ${p.total}${p.failed ? `, ошибок ${p.failed}` : ''}${p.skipped ? `, пропущено ${p.skipped}` : ''}`
}

export function percent(run: Run | null | undefined): number {
  const p = run?.progress
  return p && p.total ? Math.round(((p.sent + p.failed + p.skipped) / p.total) * 100) : 0
}

export function latestRun(c: Campaign): Run | null {
  return c.current ?? c.runs[0] ?? null
}

/** Строка под названием заявки: прогресс · кому · когда · создана. */
export function metaLine(c: Campaign): string {
  const next = c.enabled && c.nextRunAt && !c.current ? (c.repeatMode === 'ONCE' ? ` · начнётся ${formatTime(c.nextRunAt)}` : ` · следующая ${formatTime(c.nextRunAt)}`) : ''
  return `${progressText(latestRun(c))} · ${whereText(c)} · ${scheduleText(c)}${next} · создана ${formatTime(c.createdAt)}`
}

/** Технические причины доставки — понятными словами. */
export function deliveryReason(error: string): string {
  if (/group inactive/.test(error)) return 'группа вышла из рассылки'
  if (/error 479/.test(error)) return 'WhatsApp отклонил отправку в эту группу'
  if (/not connected/.test(error)) return 'не было связи с WhatsApp'
  return error
}
