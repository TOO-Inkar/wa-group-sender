import { ClipboardList, LogOut, Settings, Smartphone, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '@/features/auth/api'
import { useHealth } from '@/features/health/api'
import { StatusBanner } from '@/features/health/StatusBanner'
import { StatusChip } from '@/features/health/StatusChip'
import { sessionTone } from '@/features/health/texts'
import { useTelegram } from '@/features/telegram/api'
import { cn } from '@/shared/lib/cn'

const dots = { ok: 'bg-accent', warn: 'bg-[#e0a030]', bad: 'bg-danger', info: 'bg-info-text', neutral: 'bg-neutral-bg' }

function Count({ value }: { value: number }) {
  return value ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-text tabular-nums">{value}</span> : null
}

/** Меню слева (на телефоне — сверху) и страница. */
export function AppLayout() {
  const { data: health } = useHealth()
  const { data: telegram } = useTelegram()
  const logout = useLogout()
  const tone = health ? sessionTone(health.session) : 'bad'
  const pending = telegram?.subscribers.filter((s) => s.status === 'PENDING').length ?? 0

  const items = [
    { to: '/campaigns', label: 'Заявки', icon: <ClipboardList size={17} />, extra: <Count value={health?.queueLength ?? 0} /> },
    { to: '/groups', label: 'Группы', icon: <Users size={17} /> },
    { to: '/connection', label: 'Номер', icon: <Smartphone size={17} />, extra: <span className={cn('size-2 rounded-full', dots[tone])} /> },
    { to: '/settings', label: 'Настройки', icon: <Settings size={17} />, extra: <Count value={pending} /> },
  ]

  return (
    <div className="grid min-h-full md:grid-cols-[208px_minmax(0,1fr)]">
      <aside className="z-20 flex items-center gap-2 overflow-x-auto border-b border-border bg-surface px-2.5 py-2 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:gap-4 md:border-r md:border-b-0 md:px-3 md:py-4">
        <div className="flex shrink-0 items-center gap-2.5 md:px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-text">W</div>
          <div className="hidden min-w-0 md:block">
            <div className="text-sm leading-tight font-semibold">wa-group-sender</div>
            <StatusChip />
          </div>
        </div>
        <nav className="flex gap-0.5 md:grid">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap text-muted hover:bg-surface-2 hover:text-text', isActive && 'bg-accent-soft font-semibold text-ok-text')
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.extra}
            </NavLink>
          ))}
        </nav>
        <StatusChip className="shrink-0 md:hidden" />
        <button type="button" onClick={() => logout.mutate()} className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text md:mt-auto md:ml-0">
          <LogOut size={16} /> <span className="hidden md:inline">Выйти</span>
        </button>
      </aside>
      <main className="w-full max-w-[1280px] px-4 pt-4 pb-20 md:px-6 md:pt-5">
        <StatusBanner />
        <Outlet />
      </main>
    </div>
  )
}
