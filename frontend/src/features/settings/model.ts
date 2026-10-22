import { dispatcherInfo } from '@/features/health/texts'
import type { Settings } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/badge'

export function windowText(s: Settings): string {
  const hours = s.windowStart === s.windowEnd ? 'круглосуточно' : `${s.windowStart}–${s.windowEnd}`
  return `${hours}, ${s.weekendsEnabled ? 'ежедневно' : 'по будням'}`
}

export function limitsText(s: Settings): string {
  const hourly = s.hourlyLimit ? `${s.hourlyLimit} в час` : 'без лимита в час'
  const daily = s.dailyLimit ? `${s.dailyLimit} в день` : 'без лимита в день'
  return `${hourly} · ${daily}`
}

export function autoReplyText(s: Settings): string {
  const parts = [s.autoReplyEnabled && 'отвечает на сообщения', s.autoReplyRejectCalls && 'отклоняет звонки'].filter(Boolean)
  return parts.length ? `${parts.join(', ')} · раз в ${s.autoReplyCooldownHours} ч на человека` : 'выключен'
}

export type DispatchControl = { badge: string; tone: Tone; hint?: string; action: 'pause' | 'resume'; label: string; confirm?: string }

export function dispatchControl(dispatcher: string): DispatchControl {
  if (dispatcher === 'stopped-by-risk') {
    return {
      badge: 'Остановлена: риск',
      tone: 'bad',
      hint: 'WhatsApp подряд отказывал или обрывал связь — рассылку остановили, чтобы не потерять номер. Проверьте телефон: WhatsApp открывается, номер не заблокирован.',
      action: 'resume',
      label: 'Проверил телефон — возобновить',
      confirm: 'Номер в порядке и WhatsApp на телефоне работает?',
    }
  }
  if (dispatcher === 'stopped') {
    return { badge: 'Остановлена', tone: 'bad', hint: 'Сервис перезапускается — обычно это минута.', action: 'resume', label: 'Возобновить' }
  }
  if (dispatcher === 'paused') {
    return { badge: 'На паузе', tone: 'warn', hint: 'Новые сообщения не уходят, заявки ждут в очереди.', action: 'resume', label: 'Возобновить' }
  }
  const info = dispatcherInfo(dispatcher)
  return { badge: `Работает · ${info.short}`, tone: info.tone === 'warn' ? 'warn' : 'ok', hint: info.hint, action: 'pause', label: 'Поставить на паузу' }
}
