import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '@/features/auth/api'
import { useHealth } from '@/features/health/api'
import { StatusBanner } from '@/features/health/StatusBanner'
import { SESSION_TEXT, sessionTone } from '@/features/health/texts'
import { useTelegram } from '@/features/telegram/api'
import { cn } from '@/shared/lib/cn'

const tones = { ok: 'text-ok-text', warn: 'text-warn-text', bad: 'text-bad-text', info: 'text-info-text', neutral: 'text-muted' }
const dots = { ok: 'bg-accent', warn: 'bg-[#e0a030]', bad: 'bg-danger', info: 'bg-info-text', neutral: 'bg-neutral-bg' }

function Count({ value }: { value: number }) {
  return value ? <span className="rounded-full bg-accent px-2 text-xs font-semibold text-accent-text">{value}</span> : null
}

/** Меню слева (на телефоне — сверху), строка состояния и страница. */
export function AppLayout() {
  const { data: health } = useHealth()
  const { data: telegram } = useTelegram()
  const logout = useLogout()
  const tone = health ? sessionTone(health.session) : 'bad'
  const pending = telegram?.subscribers.filter((s) => s.status === 'PENDING').length ?? 0

  const items = [
    { to: '/campaigns', label: 'Заявки', extra: <Count value={health?.queueLength ?? 0} /> },
    { to: '/campaigns/new', label: 'Новая заявка' },
    { to: '/groups', label: 'Группы' },
    { to: '/connection', label: 'Подключение', extra: <span className={cn('size-2.5 rounded-full', dots[tone])} /> },
    { to: '/settings', label: 'Настройки', extra: <Count value={pending} /> },
  ]

  return (
    <div className="grid min-h-full md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="z-20 flex gap-3 overflow-x-auto border-b border-border bg-surface p-2.5 md:sticky md:top-0 md:h-dvh md:flex-col md:gap-5 md:border-r md:border-b-0 md:p-4.5">
        <div className="flex shrink-0 items-center gap-2.5 md:px-1.5">
          <div className="grid size-9 place-items-center rounded-lg bg-accent font-bold text-accent-text">W</div>
          <div className="hidden md:block">
            <div className="leading-tight font-bold">wa-group-sender</div>
            <div className={cn('text-[13px]', tones[tone])}>{health ? (SESSION_TEXT[health.session] ?? health.session) : 'нет связи с сервисом'}</div>
          </div>
        </div>
        <nav className="flex gap-0.5 md:grid">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/campaigns'}
              className={({ isActive }) =>
                cn('flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted hover:bg-surface-2 hover:text-text', isActive && 'bg-accent-soft font-semibold text-ok-text')
              }
            >
              {item.label}
              {item.extra}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => logout.mutate()} className="flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-text md:mt-auto">
          <LogOut size={15} /> Выйти
        </button>
      </aside>
      <main className="w-full max-w-[1180px] px-4 pt-5 pb-24 md:px-7 md:pt-6">
        <StatusBanner />
        <Outlet />
      </main>
    </div>
  )
}
