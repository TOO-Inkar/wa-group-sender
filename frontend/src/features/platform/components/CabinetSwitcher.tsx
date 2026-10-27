import { Check, ChevronsUpDown, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useEnterTenant, useTenants, type TenantOverview } from '../api'
import { isBlocked, matchesTenant } from '../model'
import { TenantBadges } from './TenantState'
import { useMe } from '@/features/auth/api'
import { adminAreaUrl, isSuperadmin, PLATFORM_PATH } from '@/features/auth/model'
import { sessionTone } from '@/features/health/texts'
import { cn } from '@/shared/lib/cn'
import { Dot } from '@/shared/ui/badge'
import { Dialog } from '@/shared/ui/dialog'
import { EmptyState } from '@/shared/ui/empty-state'
import { SearchInput } from '@/shared/ui/search-input'
import { buttonVariants, FOCUS_RING } from '@/shared/ui/styles'

const FALLBACK = 'wa-group-sender'

function TenantOption({ t, current, onPick, busy }: { t: TenantOverview; current: boolean; onPick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={isBlocked(t) || busy}
      onClick={onPick}
      aria-current={current || undefined}
      className={cn('flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:enabled:bg-surface-2 disabled:cursor-default disabled:opacity-60', FOCUS_RING, current && 'bg-surface-2')}
    >
      <Dot tone={isBlocked(t) ? 'neutral' : sessionTone(t.session)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{t.name}</span>
        <span className="block truncate text-[13px] text-muted tabular-nums">
          №{t.id}
          {t.account && ` · ${t.account}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        <TenantBadges t={t} quiet />
      </span>
      {current && <Check size={16} className="shrink-0 text-accent" aria-label="текущий" />}
    </button>
  )
}

export function CabinetSwitcher() {
  const { data: me } = useMe()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const superadmin = isSuperadmin(me)
  const tenants = useTenants(superadmin && open)
  const enter = useEnterTenant()
  const name = me?.tenant?.name ?? FALLBACK

  if (!superadmin) return <span className="block truncate">{name}</span>

  const shown = (tenants.data ?? []).filter((t) => matchesTenant(t, 'all', query))
  const pick = (t: TenantOverview) => (t.id === me?.tenant?.id ? setOpen(false) : enter.mutate(t.id))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Кабинет: ${name}. Сменить кабинет`}
        className={cn('-mx-1 flex max-w-full cursor-pointer items-center gap-1 rounded-md px-1 text-left hover:bg-surface-2', FOCUS_RING)}
      >
        <span className="truncate">{name}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Кабинеты"
        description="Вход записывается в журнал."
        toolbar={<SearchInput value={query} onChange={setQuery} placeholder="Поиск кабинета" />}
        footer={
          <Link to={PLATFORM_PATH} onClick={() => setOpen(false)} className={buttonVariants({ className: 'w-full' })}>
            <ShieldCheck size={16} /> Управление кабинетами
          </Link>
        }
      >
        {tenants.isError ? (
          <EmptyState inset action={<a className={buttonVariants({ variant: 'link' })} href={adminAreaUrl(window.location)}>Открыть админку</a>}>
            Список кабинетов доступен в админке.
          </EmptyState>
        ) : tenants.isPending ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : shown.length ? (
          <div className="-mx-2.5 grid gap-0.5">
            {shown.map((t) => (
              <TenantOption key={t.id} t={t} current={t.id === me?.tenant?.id} busy={enter.isPending} onPick={() => pick(t)} />
            ))}
          </div>
        ) : (
          <EmptyState inset>Ничего не найдено.</EmptyState>
        )}
        {enter.isError && (
          <p role="alert" className="text-sm text-danger">
            {enter.error.message}
          </p>
        )}
      </Dialog>
    </>
  )
}
