import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { matches, sendable, sortGroups, useDeleteGroupList, useGroupLists, useGroups, useResetRejections, useSaveGroupList, useSyncGroups } from '@/features/groups/api'
import { GroupName, GroupTags } from '@/features/groups/GroupTags'
import { formatTime, plural } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Card, CardTitle } from '@/shared/ui/card'
import { useConfirm } from '@/shared/ui/confirm'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Chips, PageHeader } from '@/shared/ui/misc'
import type { Group } from '@/shared/api/types'

type Filter = 'all' | 'active' | 'writable' | 'unarchived' | 'blocked' | 'selected'

export function GroupsPage() {
  const { data: groups = [] } = useGroups()
  const { data: lists = [] } = useGroupLists()
  const sync = useSyncGroups()
  const reset = useResetRejections()
  const saveList = useSaveGroupList()
  const deleteList = useDeleteGroupList()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const filters: Record<Filter, (g: Group) => boolean> = {
    all: () => true,
    active: (g) => g.active,
    writable: sendable,
    unarchived: (g) => !g.archived,
    blocked: (g) => g.community || g.tooLarge || g.rejected,
    selected: (g) => selected.has(g.jid),
  }
  const shown = useMemo(() => sortGroups(groups.filter((g) => filters[filter](g) && matches(g, query))), [groups, filter, query, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownSendable = shown.filter(sendable).map((g) => g.jid)
  const allShown = shownSendable.length > 0 && shownSendable.every((j) => selected.has(j))
  const lastSync = groups.reduce((max, g) => Math.max(max, Date.parse(g.lastSync)), 0)

  const toggle = (jids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      jids.forEach((j) => (on ? next.add(j) : next.delete(j)))
      return next
    })

  return (
    <>
      <PageHeader
        title="Группы"
        lead={groups.length ? `Групп номера: ${groups.length}, в рассылке ${groups.filter((g) => g.active).length}. Обновлено ${formatTime(lastSync)}.` : 'Групп пока нет: привяжите номер и обновите список.'}
        actions={
          <Button
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (r) => (r.done ? toast.success(`Готово: всего ${r.total}, в рассылке ${r.active}`) : toast.error('Не получилось: WhatsApp не подключён')),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {sync.isPending ? 'Обновляем… до пары минут' : 'Обновить из WhatsApp'}
          </Button>
        }
      />
      <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <Input type="search" placeholder="Поиск по названию группы" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'active', label: 'В рассылке' },
              { value: 'writable', label: 'Можно писать' },
              { value: 'unarchived', label: 'Не в архиве' },
              { value: 'blocked', label: 'Не для рассылки' },
              { value: 'selected', label: 'Отмеченные' },
            ]}
          />
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="w-9 py-2.5 pl-3">
                    <input type="checkbox" className="size-4 accent-accent" checked={allShown} onChange={(e) => toggle(shownSendable, e.target.checked)} title="Отметить все показанные" />
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Группа</th>
                  <th className="px-3 py-2.5 font-semibold">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => (
                  <tr key={g.jid} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <td className="py-2.5 pl-3">
                      <input type="checkbox" className="size-4 accent-accent" checked={selected.has(g.jid)} disabled={!sendable(g)} onChange={(e) => toggle([g.jid], e.target.checked)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <GroupName group={g} />
                    </td>
                    <td className="px-3 py-2.5">
                      <GroupTags group={g} onReset={(jid) => reset.mutate(jid, { onSuccess: () => toast.success('Группа вернётся в рассылку') })} />
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={3} className="p-4 text-muted">
                      Ничего не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Card className="sticky top-4 grid gap-2.5">
          <CardTitle className="mb-0">Списки групп</CardTitle>
          <p className="text-[13px] text-muted">Набор групп, куда можно отправить заявку вместо рассылки по всем. Отметьте группы слева и сохраните.</p>
          {lists.map((list) => (
            <div key={list.id} className="grid gap-1.5 rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <b className="[overflow-wrap:anywhere]">{list.name}</b>
                <span className="text-[13px] text-muted">{plural(list.groups.length, 'группа', 'группы', 'групп')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'list', listId: String(list.id) } })}>
                  Заявка в список
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelected(new Set(list.groups))
                    setFilter('selected')
                  }}
                >
                  Показать
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (await confirm({ title: `Удалить список «${list.name}»?`, body: <p>Сами группы и уже созданные заявки не изменятся.</p>, confirm: 'Удалить', danger: true }))
                      deleteList.mutate(list.id)
                  }}
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))}
          {!lists.length && <p className="text-[13px] text-muted">Списков пока нет.</p>}
        </Card>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-4.5 left-1/2 z-30 flex w-[min(760px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-2.5 font-semibold shadow-xl">
          <span>Отмечено: {plural(selected.size, 'группа', 'группы', 'групп')}</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'pick', groups: [...selected] } })}>
              Заявка в отмеченные
            </Button>
            <Button onClick={() => setNaming(true)}>Сохранить как список</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Сбросить
            </Button>
          </div>
        </div>
      )}

      <Dialog open={naming} onOpenChange={setNaming} title="Сохранить список" description={`${plural(selected.size, 'группа', 'группы', 'групп')}. Список с таким названием будет заменён.`}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            saveList.mutate(
              { name: name.trim(), groups: [...selected] },
              {
                onSuccess: () => {
                  toast.success(`Список «${name.trim()}» сохранён`)
                  setNaming(false)
                  setName('')
                },
                onError: (err) => toast.error(err.message),
              },
            )
          }}
        >
          <Input autoFocus placeholder="Название, например Тест" value={name} onChange={(e) => setName(e.target.value)} />
          <DialogActions>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || saveList.isPending}>
              Сохранить
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  )
}
