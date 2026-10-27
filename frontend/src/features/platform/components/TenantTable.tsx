import { Ban, Info, LogIn, Play } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { TenantOverview } from '../api'
import { useTenantCommands } from '../commands'
import { isBlocked, usersCount } from '../model'
import { DispatcherText, SessionBadge, TenantBadges } from './TenantState'
import { cn } from '@/shared/lib/cn'
import { RowMenu } from '@/shared/ui/menu'

function actions(t: TenantOverview, cmd: ReturnType<typeof useTenantCommands>, open: () => void) {
  return [
    { label: 'Войти в кабинет', icon: <LogIn size={15} />, onSelect: () => cmd.enter(t), disabled: isBlocked(t) },
    { label: 'Подробнее', icon: <Info size={15} />, onSelect: open },
    { label: 'Заблокировать', icon: <Ban size={15} />, onSelect: () => cmd.toggleBlock(t), hidden: isBlocked(t), danger: true },
    { label: 'Разблокировать', icon: <Play size={15} />, onSelect: () => cmd.toggleBlock(t), hidden: !isBlocked(t) },
  ]
}

function Name({ t }: { t: TenantOverview }) {
  return (
    <span className="truncate font-semibold" title={t.name}>
      <span className="font-normal text-muted tabular-nums">№{t.id}</span> {t.name}
    </span>
  )
}

const num = (n: number) => <b className="font-semibold text-text tabular-nums">{n}</b>

export function TenantTable({ tenants }: { tenants: TenantOverview[] }) {
  const navigate = useNavigate()
  const cmd = useTenantCommands()
  const open = (t: TenantOverview) => navigate(`/platform/tenants/${t.id}`)

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface xl:hidden">
        {tenants.map((t) => (
          <li key={t.id} className={cn('relative flex gap-2 py-3 pr-2 pl-4', isBlocked(t) && 'bg-surface-2/50')}>
            <button type="button" onClick={() => open(t)} aria-label={t.name} className="grid min-w-0 flex-1 cursor-pointer gap-1.5 text-left after:absolute after:inset-0">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Name t={t} />
                <TenantBadges t={t} />
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <SessionBadge t={t} />
                {t.account && <span className="text-muted tabular-nums">{t.account}</span>}
              </span>
              <span className="text-[13px] text-muted">
                <DispatcherText t={t} />
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
                <span>групп {num(t.activeGroups)}</span>
                <span>сегодня {num(t.sentToday)}</span>
                <span>за час {num(t.sentLastHour)}</span>
                <span>в очереди {num(t.queueLength)}</span>
                <span>{usersCount(t.users)}</span>
              </span>
            </button>
            <span className="relative z-10 self-start">
              <RowMenu items={actions(t, cmd, () => open(t))} />
            </span>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface xl:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2.5 font-medium">Кабинет</th>
              <th className="w-44 px-3 py-2.5 font-medium">Номер</th>
              <th className="w-44 px-3 py-2.5 font-medium">Рассылка</th>
              <th className="w-16 px-3 py-2.5 text-right font-medium">Группы</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Сегодня / час</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Очередь</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} onClick={() => open(t)} className={cn('cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2', isBlocked(t) && 'text-muted')}>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Name t={t} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    {usersCount(t.users)}
                    <TenantBadges t={t} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <SessionBadge t={t} />
                  <div className="truncate text-[13px] text-muted tabular-nums" title={t.proxy ?? undefined}>
                    {t.account ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  <DispatcherText t={t} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.activeGroups}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {t.sentToday} <span className="text-muted">/ {t.sentLastHour}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.queueLength}</td>
                <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowMenu items={actions(t, cmd, () => open(t))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
