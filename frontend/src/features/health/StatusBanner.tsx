import { Link } from 'react-router'
import { useHealth } from './api'
import { cn } from '@/shared/lib/cn'

type Banner = { tone: 'warn' | 'bad'; text: string; link?: { to: string; label: string } }

/** Полоса наверху — только когда нужно вмешаться; обычное состояние — в индикаторе меню (StatusChip). */
export function StatusBanner() {
  const { data: h, isError } = useHealth()
  let banner: Banner | null = null
  if (isError) banner = { tone: 'bad', text: 'Сервис не отвечает — страница переподключится сама.' }
  else if (h?.session === 'BANNED') banner = { tone: 'bad', text: 'Номер заблокирован WhatsApp, рассылка остановлена.' }
  else if (h?.session === 'WAITING_QR' || h?.session === 'LOGGED_OUT') banner = { tone: 'bad', text: 'Номер не привязан — заявки не уйдут.', link: { to: '/connection', label: 'Привязать' } }
  else if (h?.stoppedByRisk) banner = { tone: 'bad', text: `Рассылка остановлена по риску (${h.riskEventsInWindow} сигналов за час). Проверьте телефон.`, link: { to: '/settings', label: 'Возобновить' } }
  else if (h?.dispatcher === 'paused') banner = { tone: 'warn', text: 'Рассылка на паузе.', link: { to: '/settings', label: 'Возобновить' } }
  if (!banner) return null
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-medium', banner.tone === 'bad' ? 'bg-bad-bg text-bad-text' : 'bg-warn-bg text-warn-text')}>
      <span>{banner.text}</span>
      {banner.link && (
        <Link to={banner.link.to} className="rounded-lg bg-surface px-3 py-1 text-text">
          {banner.link.label}
        </Link>
      )}
    </div>
  )
}
