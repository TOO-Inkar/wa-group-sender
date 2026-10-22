import { ClipboardList, LogOut, Settings, Smartphone, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '@/features/auth/api'
import { useHealth } from '@/features/health/api'
import { StatusBanner } from '@/features/health/StatusBanner'
import { StatusChip } from '@/features/health/StatusChip'
import { sessionTone } from '@/features/health/texts'
import { useTelegram } from '@/features/telegram/api'
import { cn } from '@/shared/lib/cn'
import { Count, Dot } from '@/shared/ui/badge'
import { Logo } from '@/shared/ui/logo'

export function AppLayout() {
  const { data: health } = useHealth()
  const { data: telegram } = useTelegram()
  const logout = useLogout()
  const tone = health ? sessionTone(health.session) : 'bad'
  const pending = telegram?.subscribers.filter((s) => s.status === 'PENDING').length ?? 0

  const items = [
    { to: '/campaigns', label: 'Заявки', icon: ClipboardList, extra: <Count value={health?.queueLength ?? 0} /> },
    { to: '/groups', label: 'Группы', icon: Users },
    { to: '/connection', label: 'Номер', icon: Smartphone, extra: <Dot tone={tone} /> },
    { to: '/settings', label: 'Настройки', icon: Settings, extra: <Count value={pending} /> },
  ]

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-1">
      {/* Телефон: шапка сверху, разделы — в нижней панели. */}
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border bg-surface px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 md:hidden">
        <Logo className="size-7" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-tight font-semibold">wa-group-sender</div>
          <StatusChip />
        </div>
        <button type="button" onClick={() => logout.mutate()} aria-label="Выйти" className="-mr-2 grid size-10 cursor-pointer place-items-center rounded-lg text-muted hover:text-text">
          <LogOut size={18} />
        </button>
      </header>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-border bg-surface px-3 py-4 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <Logo />
          <div className="min-w-0">
            <div className="text-sm leading-tight font-semibold">wa-group-sender</div>
            <StatusChip />
          </div>
        </div>
        <nav className="grid gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text', isActive && 'bg-surface-2 font-semibold text-text [&>svg]:text-accent')
              }
            >
              <item.icon size={17} />
              <span className="flex-1">{item.label}</span>
              {item.extra}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => logout.mutate()} className="mt-auto flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text">
          <LogOut size={16} /> Выйти
        </button>
      </aside>

      <main className="w-full max-w-[1280px] px-4 pt-4 pb-[calc(88px+env(safe-area-inset-bottom))] md:px-6 md:pt-5 md:pb-20">
        <StatusBanner />
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn('grid justify-items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium text-muted', isActive && 'text-text [&_svg]:text-accent')}
          >
            <span className="relative">
              <item.icon size={21} />
              {item.extra && <span className="absolute -top-1 left-[calc(100%-6px)] flex">{item.extra}</span>}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
