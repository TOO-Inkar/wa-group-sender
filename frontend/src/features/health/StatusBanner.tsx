import { Link } from 'react-router'
import { useHealth } from './api'
import { cn } from '@/shared/lib/cn'

type Banner = { tone: 'ok' | 'warn' | 'bad' | 'info'; title: string; text?: string; link?: { to: string; label: string } }

const tones = {
  ok: 'bg-ok-bg text-ok-text',
  warn: 'bg-warn-bg text-warn-text',
  bad: 'bg-bad-bg text-bad-text',
  info: 'bg-info-bg text-info-text',
}

/** Одна строка наверху: что сейчас мешает рассылке и что с этим сделать. */
export function StatusBanner() {
  const { data: h, isError } = useHealth()
  let banner: Banner | null = null
  if (isError) banner = { tone: 'bad', title: 'Сервис не отвечает.', text: 'Страница попробует ещё раз через несколько секунд.' }
  else if (!h) banner = null
  else if (h.session === 'BANNED') banner = { tone: 'bad', title: 'Номер заблокирован WhatsApp.', text: 'Рассылка остановлена.' }
  else if (h.session === 'WAITING_QR' || h.session === 'LOGGED_OUT')
    banner = { tone: 'bad', title: 'Номер не привязан.', text: 'Заявки не уйдут, пока не отсканирован QR.', link: { to: '/connection', label: 'Привязать номер' } }
  else if (h.session !== 'CONNECTED') banner = { tone: 'warn', title: 'Подключаемся к WhatsApp…', text: 'Обычно это до минуты.' }
  else if (h.stoppedByRisk)
    banner = { tone: 'bad', title: 'Рассылка остановлена по риску.', text: `Сигналов за час: ${h.riskEventsInWindow}. Проверьте телефон и возобновите.`, link: { to: '/settings', label: 'Настройки' } }
  else if (h.dispatcher === 'paused') banner = { tone: 'warn', title: 'Рассылка на паузе.', link: { to: '/settings', label: 'Настройки' } }
  else if (h.dispatcher === 'outside-window') banner = { tone: 'info', title: 'Сейчас вне рабочего окна.', text: 'Рассылка продолжится, когда оно откроется.' }
  else if (h.dispatcher === 'daily-limit-reached')
    banner = { tone: 'info', title: 'Дневной лимит исчерпан:', text: `отправлено ${h.sentToday} из ${h.warmupLimitToday ?? '—'}. Остальное уйдёт завтра.` }
  else if (h.dispatcher === 'hourly-limit-reached')
    banner = { tone: 'info', title: 'Лимит в час исчерпан:', text: `${h.sentLastHour} из ${h.hourlyLimit} за час. Рассылка продолжится сама.` }
  else if (h.dispatcher === 'waiting-groups')
    banner = { tone: 'info', title: 'Ждём:', text: 'в оставшихся группах последнее сообщение наше — пишем, когда там кто-то напишет или пройдёт пауза.' }
  else if (h.dispatcher === 'running')
    banner = { tone: 'ok', title: 'Идёт рассылка.', text: `Рассылок в работе: ${h.queueLength}, отправлено сегодня: ${h.sentToday}.` }

  if (!banner) return null
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl px-4 py-3 text-sm', tones[banner.tone])}>
      <div>
        <b>{banner.title}</b> {banner.text}
      </div>
      {banner.link && (
        <Link to={banner.link.to} className="rounded-lg border border-current/20 bg-surface px-3 py-1.5 font-medium text-text">
          {banner.link.label}
        </Link>
      )}
    </div>
  )
}
