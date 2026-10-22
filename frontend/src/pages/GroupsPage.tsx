import { RefreshCw, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { matches, sendable, sortGroups, useDeleteGroupList, useGroupLists, useGroups, useResetRejections, useSaveGroupList, useSyncGroups } from '@/features/groups/api'
import { GroupName, GroupTags } from '@/features/groups/GroupTags'
import type { Group } from '@/shared/api/types'
import { formatTime, plural } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Input, Select } from '@/shared/ui/input'
import { RowMenu } from '@/shared/ui/menu'
import { Segmented } from '@/shared/ui/segmented'

type Filter = 'all' | 'active' | 'writable' | 'blocked' | 'selected'

/** Группы номера: фильтры и списки в одной строке, отметки — для заявки или нового списка. */
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
  const [listId, setListId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const list = lists.find((l) => String(l.id) === listId)
  const filters: Record<Filter, (g: Group) => boolean> = {
    all: () => true,
    active: (g) => g.active,
    writable: sendable,
    blocked: (g) => !g.active,
    selected: (g) => selected.has(g.jid),
  }
  const count = (f: Filter) => groups.filter(filters[f]).length
  const shown = useMemo(
    () => sortGroups(groups.filter((g) => filters[filter](g) && (!list || list.groups.includes(g.jid)) && matches(g, query))),
    [groups, filter, query, selected, list], // eslint-disable-line react-hooks/exhaustive-deps
  )
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Группы</h1>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все', count: groups.length },
            { value: 'active', label: 'В рассылке', count: count('active') },
            { value: 'blocked', label: 'Не в рассылке', count: count('blocked') },
            ...(selected.size ? [{ value: 'selected' as const, label: 'Отмеченные', count: selected.size }] : []),
          ]}
        />
        <span className="flex items-center gap-1">
          <Select className="py-1.5 text-sm" value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Список групп">
            <option value="">Все списки</option>
            {lists.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} · {l.groups.length}
              </option>
            ))}
          </Select>
          {list && (
            <RowMenu
              label="Действия со списком"
              items={[
                { label: 'Заявка в этот список', icon: <Send size={15} />, onSelect: () => navigate('/campaigns/new', { state: { target: 'list', listId: String(list.id) } }) },
                { label: 'Отметить его группы', onSelect: () => setSelected(new Set(list.groups)) },
                {
                  label: 'Удалить список',
                  icon: <Trash2 size={15} />,
                  danger: true,
                  onSelect: async () => {
                    if (await confirm({ title: `Удалить список «${list.name}»?`, body: <p>Группы и заявки не изменятся.</p>, confirm: 'Удалить', danger: true })) {
                      deleteList.mutate(list.id)
                      setListId('')
                    }
                  },
                },
              ]}
            />
          )}
        </span>
        <Input type="search" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full py-1.5 text-sm sm:ml-auto sm:w-56" />
        <Button
          size="sm"
          disabled={sync.isPending}
          title={lastSync ? `Обновлено ${formatTime(lastSync)}` : undefined}
          onClick={() =>
            sync.mutate(undefined, {
              onSuccess: (r) => (r.done ? toast.success(`Обновлено: в рассылке ${r.active} из ${r.total}`) : toast.error('WhatsApp не подключён')),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} /> {sync.isPending ? 'Обновляем…' : 'Обновить'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="w-10 py-2.5 pl-3">
                <input type="checkbox" className="size-4 accent-accent" checked={allShown} onChange={(e) => toggle(shownSendable, e.target.checked)} aria-label="Отметить все показанные" />
              </th>
              <th className="px-3 py-2.5 font-medium">Группа</th>
              <th className="px-3 py-2.5 font-medium">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.jid} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                <td className="py-2 pl-3">
                  <input type="checkbox" className="size-4 accent-accent" checked={selected.has(g.jid)} disabled={!sendable(g)} onChange={(e) => toggle([g.jid], e.target.checked)} aria-label={g.name ?? g.jid} />
                </td>
                <td className="px-3 py-2">
                  <GroupName group={g} />
                </td>
                <td className="px-3 py-2">
                  <GroupTags group={g} onReset={(jid) => reset.mutate(jid, { onSuccess: () => toast.success('Группа вернётся в рассылку') })} />
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={3} className="p-4 text-muted">
                  {groups.length ? 'Ничего не найдено' : 'Групп пока нет — подключите номер и нажмите «Обновить».'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-xl">
          <span className="text-sm font-semibold">Отмечено {plural(selected.size, 'группа', 'группы', 'групп')}</span>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'pick', groups: [...selected] } })}>
              Заявка в отмеченные
            </Button>
            <Button size="sm" onClick={() => setNaming(true)}>
              Сохранить как список
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Сбросить
            </Button>
          </div>
        </div>
      )}

      <Dialog open={naming} onOpenChange={setNaming} title="Новый список групп" description={`${plural(selected.size, 'группа', 'группы', 'групп')}. Список с тем же названием заменится.`}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            saveList.mutate(
              { name: name.trim(), groups: [...selected] },
              {
                onSuccess: (saved) => {
                  toast.success(`Список «${saved.name}» сохранён`)
                  setNaming(false)
                  setName('')
                  setSelected(new Set())
                  setListId(String(saved.id))
                },
                onError: (err) => toast.error(err.message),
              },
            )
          }}
        >
          <Input autoFocus placeholder="Например, Тест" value={name} onChange={(e) => setName(e.target.value)} />
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
