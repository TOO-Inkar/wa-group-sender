import { Ban, History, LogIn, Play, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useProxyCheck, useUpdateTenant, type ProxyCheck, type TenantOverview } from '../api'
import { useTenantCommands } from '../commands'
import { isBlocked, proxyError, PROXY_PLACEHOLDER, proxyVerdict } from '../model'
import { DeleteTenantDialog } from './DeleteTenantDialog'
import { DispatcherText, SessionBadge, TenantBadges } from './TenantState'
import { UserList } from './UserList'
import { cn } from '@/shared/lib/cn'
import { formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Field, Input } from '@/shared/ui/input'
import { Sheet } from '@/shared/ui/sheet'
import { buttonVariants } from '@/shared/ui/styles'

function Cell({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('grid min-w-0 content-start gap-0.5 bg-surface px-3 py-2.5', wide && 'col-span-2')}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[15px] font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

function RenameForm({ tenant }: { tenant: TenantOverview }) {
  const update = useUpdateTenant()
  const [name, setName] = useState(tenant.name)
  const changed = name.trim() !== tenant.name
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !changed) return
    update.mutate({ id: tenant.id, name: name.trim() }, { onSuccess: () => toast.success('Название сохранено'), onError: (e) => toast.error(e.message) })
  }
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Field label="Название" className="min-w-0 flex-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" disabled={!name.trim() || !changed || update.isPending}>
        Сохранить
      </Button>
    </form>
  )
}

function ProxyForm({ tenant }: { tenant: TenantOverview }) {
  const update = useUpdateTenant()
  const check = useProxyCheck()
  const confirm = useConfirm()
  const [value, setValue] = useState('')
  const [result, setResult] = useState<ProxyCheck | null>(null)
  const error = proxyError(value)

  const save = (proxy: string | null, done: string) =>
    update.mutate(
      { id: tenant.id, proxy },
      {
        onSuccess: () => {
          toast.success(done)
          setValue('')
          setResult(null)
        },
        onError: (e) => toast.error(e.message),
      },
    )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim() && !error) save(value.trim(), 'Прокси сохранён, номер переподключится')
  }

  const clear = async () => {
    if (
      await confirm({
        title: 'Убрать прокси?',
        body: <p>{tenant.proxyRequired && !tenant.legacy ? 'Без прокси номер этого кабинета не будет подключаться.' : 'Номер будет подключаться напрямую, с IP сервера.'}</p>,
        confirm: 'Убрать',
        danger: true,
      })
    )
      save(null, 'Прокси убран')
  }

  const verdict = result && proxyVerdict(result)
  const runCheck = () => check.mutate(tenant.id, { onSuccess: setResult, onError: (e) => setResult({ ok: false, error: e.message }) })

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm">
          <b>Прокси</b>{' '}
          {tenant.proxy ? (
            <code className="text-[13px] [overflow-wrap:anywhere] text-muted">{tenant.proxy}</code>
          ) : (
            <span className="text-[13px] text-muted">{tenant.proxyRequired && !tenant.legacy ? 'не задан — номер не подключится' : 'не задан, подключение напрямую'}</span>
          )}
        </span>
        {tenant.proxy && (
          <span className="flex gap-1">
            <Button size="sm" disabled={check.isPending} onClick={runCheck}>
              {check.isPending ? 'Проверяем…' : 'Проверить'}
            </Button>
            <Button size="sm" variant="danger" onClick={clear} disabled={update.isPending}>
              Убрать
            </Button>
          </span>
        )}
      </div>
      {verdict && (
        <p role="status" className={verdict.ok ? 'text-[13px] text-ok-text' : 'text-[13px] text-bad-text'}>
          {verdict.text}
        </p>
      )}
      <div className="flex items-start gap-2">
        <Field label={tenant.proxy ? 'Заменить прокси' : 'Задать прокси'} error={value ? error : undefined} className="min-w-0 flex-1">
          <Input
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="font-mono"
            placeholder={PROXY_PLACEHOLDER}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!(value && error)}
          />
        </Field>
        <Button type="submit" className="mt-[26px]" disabled={!value.trim() || !!error || update.isPending}>
          Сохранить
        </Button>
      </div>
    </form>
  )
}

export function TenantSheet({ tenant, onClose }: { tenant: TenantOverview; onClose: () => void }) {
  const cmd = useTenantCommands()
  const [deleting, setDeleting] = useState(false)
  const blocked = isBlocked(tenant)

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      width="max-w-xl"
      title={tenant.name}
      subtitle={`№${tenant.id} · создан ${formatTime(tenant.createdAt)}${tenant.legacy ? ' · основной кабинет' : ''}`}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={blocked ? 'secondary' : 'danger'} onClick={() => cmd.toggleBlock(tenant)} disabled={cmd.busy}>
            {blocked ? <Play size={15} /> : <Ban size={15} />} {blocked ? 'Разблокировать' : 'Заблокировать'}
          </Button>
          {!tenant.legacy && (
            <Button variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 size={15} /> Удалить
            </Button>
          )}
          <Button variant="primary" className="ml-auto" disabled={blocked || cmd.busy} onClick={() => cmd.enter(tenant)}>
            <LogIn size={15} /> Войти в кабинет
          </Button>
        </div>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <TenantBadges t={tenant} />
          <Link to={`/platform/audit?tenant=${tenant.id}`} className={buttonVariants({ variant: 'link', size: 'inline', className: 'ml-auto' })}>
            <History size={14} /> Журнал кабинета
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          <Cell label="Номер" wide>
            <span className="flex flex-wrap items-center gap-2">
              <SessionBadge t={tenant} />
              {tenant.account && <span>{tenant.account}</span>}
            </span>
          </Cell>
          <Cell label="Рассылка" wide>
            <span className="text-sm font-normal">
              <DispatcherText t={tenant} />
            </span>
          </Cell>
          <Cell label="Групп">{tenant.activeGroups}</Cell>
          <Cell label="Сегодня">{tenant.sentToday}</Cell>
          <Cell label="За час">{tenant.sentLastHour}</Cell>
          <Cell label="В очереди">{tenant.queueLength}</Cell>
        </dl>
        <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
          <RenameForm key={tenant.name} tenant={tenant} />
          <div className="border-t border-border pt-4">
            <ProxyForm key={tenant.proxy ?? ''} tenant={tenant} />
          </div>
        </section>
        <UserList tenantId={tenant.id} />
      </div>
      {deleting && <DeleteTenantDialog tenant={tenant} onClose={() => setDeleting(false)} onDeleted={onClose} />}
    </Sheet>
  )
}
