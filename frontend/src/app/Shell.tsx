import type { LucideIcon } from 'lucide-react'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '@/features/auth/api'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Logo } from '@/shared/ui/logo'

export type NavItem = { to: string; label: string; icon: LucideIcon; extra?: ReactNode; end?: boolean }

export function Shell({ items, title, status, footer, banner }: { items: NavItem[]; title: ReactNode; status: ReactNode; footer?: ReactNode; banner?: ReactNode }) {
  const logout = useLogout()
  const brand = (
    <div className="min-w-0 flex-1">
      <div className="text-sm leading-tight font-semibold">{title}</div>
      {status}
    </div>
  )

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-1">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border bg-surface px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 md:hidden">
        <Logo className="size-7" />
        {brand}
        <Button variant="ghost" size="icon" className="-mr-2" onClick={() => logout.mutate()} aria-label="Выйти">
          <LogOut size={18} />
        </Button>
      </header>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-border bg-surface px-3 py-4 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <Logo />
          {brand}
        </div>
        <nav className="grid gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
        <div className="mt-auto grid gap-0.5">
          {footer}
          <button type="button" onClick={() => logout.mutate()} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text">
            <LogOut size={16} /> Выйти
          </button>
        </div>
      </aside>

      <main className="w-full max-w-[1280px] px-4 pt-4 pb-[calc(88px+env(safe-area-inset-bottom))] md:px-6 md:pt-5 md:pb-20">
        {banner}
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
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
