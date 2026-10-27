import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { adminAreaUrl, isAdminHost } from '@/features/auth/model'
import { useCreateTenant, useTenants } from '@/features/platform/api'
import { AccountDialog } from '@/features/platform/components/AccountDialog'
import { TenantSheet } from '@/features/platform/components/TenantSheet'
import { TenantTable } from '@/features/platform/components/TenantTable'
import { isBlocked, matchesTenant, proxyState, type TenantFilter } from '@/features/platform/model'
import { ApiError } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/empty-state'
import { SearchInput } from '@/shared/ui/search-input'
import { Segmented } from '@/shared/ui/segmented'
import { buttonVariants } from '@/shared/ui/styles'

const HIDDEN_ON_THIS_HOST = [403, 404]

export function PlatformTenantsPage() {
  const { data: tenants = [], isPending, error } = useTenants()
  const create = useCreateTenant()
  const [filter, setFilter] = useState<TenantFilter>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const count = (f: TenantFilter) => tenants.filter((t) => matchesTenant(t, f, '')).length
  const shown = tenants.filter((t) => matchesTenant(t, filter, query))
  const withoutProxy = tenants.filter((t) => !isBlocked(t) && proxyState(t)?.tone === 'warn').length
  const elsewhere = error instanceof ApiError && HIDDEN_ON_THIS_HOST.includes(error.status) && !isAdminHost(window.location.hostname)

  return (
    <>
      <div className="mb-3 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Кабинеты</h1>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Создать кабинет
          </Button>
        </div>
        {withoutProxy > 0 && (
          <p className="rounded-xl bg-warn-bg px-4 py-2.5 text-sm font-medium text-warn-text">
            Без прокси: {withoutProxy} — номера этих кабинетов не подключатся, пока прокси не задан.
          </p>
        )}
        <div className="grid gap-2 lg:grid-cols-2">
          <Segmented
            stretch
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все', count: tenants.length },
              { value: 'active', label: 'Активные', count: count('active') },
              { value: 'blocked', label: 'Заблокированные', count: count('blocked') },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск по названию, номеру или №" />
        </div>
      </div>
      {elsewhere ? (
        <EmptyState action={<a href={adminAreaUrl(window.location)} className={buttonVariants({ variant: 'primary' })}>Открыть админку</a>}>Админка работает на отдельном адресе.</EmptyState>
      ) : error ? (
        <EmptyState>{error.message}</EmptyState>
      ) : isPending ? (
        <p className="text-muted">Загрузка…</p>
      ) : shown.length ? (
        <TenantTable tenants={shown} />
      ) : (
        <EmptyState action={!tenants.length && <Button variant="primary" onClick={() => setCreating(true)}>Создать первый кабинет</Button>}>
          {tenants.length ? 'Ничего не найдено.' : 'Кабинетов пока нет.'}
        </EmptyState>
      )}
      {creating && (
        <AccountDialog
          title="Новый кабинет"
          description="Кабинет — один номер WhatsApp со своими группами, заявками и настройками. Логин и пароль — для клиента."
          doneTitle="Кабинет создан"
          submitLabel="Создать кабинет"
          fields={['name', 'login', 'password', 'proxy']}
          onSubmit={(v) => create.mutateAsync({ name: v.name, login: v.login, password: v.password, ...(v.proxy && { proxy: v.proxy }) }).then(() => toast.success(`Кабинет «${v.name}» создан`))}
          onClose={() => setCreating(false)}
        />
      )}
      <Outlet />
    </>
  )
}

export function TenantRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: tenants } = useTenants()
  const tenant = tenants?.find((t) => String(t.id) === id)
  if (!tenants) return null
  if (!tenant) return <Navigate to="/platform" replace />
  return <TenantSheet key={tenant.id} tenant={tenant} onClose={() => navigate('/platform')} />
}
