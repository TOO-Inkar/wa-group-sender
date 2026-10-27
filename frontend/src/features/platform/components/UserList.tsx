import { KeyRound, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateUser, useDeleteUser, useTenantUsers, useUpdateUser, type PlatformUser } from '../api'
import { AccountDialog } from './AccountDialog'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { RowMenu } from '@/shared/ui/menu'

type Editing = { kind: 'add' } | { kind: 'reset'; user: PlatformUser } | null

export function UserList({ tenantId }: { tenantId: number }) {
  const { data: users, isPending } = useTenantUsers(tenantId)
  const create = useCreateUser(tenantId)
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Editing>(null)
  const fail = (e: Error) => toast.error(e.message)

  const toggle = async (u: PlatformUser) => {
    if (u.enabled && !(await confirm({ title: `Отключить ${u.login}?`, body: <p>Пользователь сразу выйдет из кабинета и не сможет войти, пока его не включат.</p>, confirm: 'Отключить', danger: true }))) return
    update.mutate({ id: u.id, enabled: !u.enabled }, { onSuccess: () => toast.success(u.enabled ? `${u.login} отключён` : `${u.login} включён`), onError: fail })
  }

  const drop = async (u: PlatformUser) => {
    if (await confirm({ title: `Удалить ${u.login}?`, body: <p>Логин перестанет работать. Данные кабинета не изменятся.</p>, confirm: 'Удалить', danger: true }))
      remove.mutate(u.id, { onSuccess: () => toast.success(`${u.login} удалён`), onError: fail })
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Пользователи</h3>
        <Button size="sm" onClick={() => setEditing({ kind: 'add' })}>
          <Plus size={15} /> Добавить
        </Button>
      </div>
      {isPending ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : !users?.length ? (
        <p className="text-sm text-muted">Пользователей нет — в кабинет можно войти только из админки.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-2 py-2 pr-2 pl-3">
              <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <b className="truncate">{u.login}</b>
                  {!u.enabled && <Badge tone="bad">отключён</Badge>}
                </span>
                <span className="truncate text-[13px] text-muted tabular-nums">
                  {u.lastLoginAt ? `вход ${formatTime(u.lastLoginAt)}` : 'ещё не входил'} · создан {formatTime(u.createdAt)}
                </span>
              </span>
              <RowMenu
                label={`Действия: ${u.login}`}
                items={[
                  { label: 'Сбросить пароль', icon: <KeyRound size={15} />, onSelect: () => setEditing({ kind: 'reset', user: u }) },
                  { label: u.enabled ? 'Отключить' : 'Включить', icon: u.enabled ? <PowerOff size={15} /> : <Power size={15} />, onSelect: () => toggle(u) },
                  { label: 'Удалить', icon: <Trash2 size={15} />, onSelect: () => drop(u), danger: true },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {editing?.kind === 'add' && (
        <AccountDialog
          title="Новый пользователь"
          doneTitle="Пользователь создан"
          submitLabel="Создать"
          fields={['login', 'password']}
          onSubmit={(v) => create.mutateAsync({ login: v.login, password: v.password })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'reset' && (
        <AccountDialog
          title={`Новый пароль для ${editing.user.login}`}
          description="Пользователь выйдет на всех устройствах и войдёт с новым паролем."
          doneTitle="Пароль изменён"
          submitLabel="Сменить пароль"
          fields={['password']}
          fixedLogin={editing.user.login}
          onSubmit={(v) => update.mutateAsync({ id: editing.user.id, password: v.password })}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
